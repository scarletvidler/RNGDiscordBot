-- Rename delivery/configuration tables and consolidate purchase history.
-- Public RPC names, arguments, and read response shapes remain backward compatible.
-- Explicit transaction: the CLI runner does not provide one for this migration.
-- Copy validation, function rebinding, and table retirement must commit together.
begin;
lock table monetization.subscriptions, monetization.one_time_purchases,
  monetization.entitlements, monetization.subscription_items,
  monetization.sku_actions, monetization.purchase_fulfillments, monetization.feature_grants
  in access exclusive mode;

alter table monetization.entitlements rename to discord_entitlements;
alter table monetization.subscription_items rename to discord_subscription_skus;
alter table monetization.sku_actions rename to sku_features;
alter table monetization.purchase_fulfillments rename to purchase_deliveries;
alter table monetization.feature_grants rename to purchase_features;

create table monetization.discord_purchases (
  application_id text not null,
  type text not null check (type in ('one_time','subscription')),
  id text not null check (id ~ '^[0-9]{1,20}$'),
  purchaser_discord_id text check (purchaser_discord_id ~ '^[0-9]{1,20}$'),
  discord_user_id text references public.discord_users(id) on delete set null,
  title text not null,
  created_at timestamptz not null,
  first_seen_at timestamptz not null default now(),
  observed_at timestamptz not null,
  deleted boolean not null default false,
  -- One-time purchase fields.
  entitlement_id text,
  sku_id text,
  kind text check (kind in ('durable','consumable')),
  beneficiary_discord_id text,
  guild_id text,
  consumed boolean,
  -- Subscription fields.
  status smallint check (status in (0,1,2)),
  current_period_start timestamptz,
  current_period_end timestamptz,
  canceled_at timestamptz,
  entitlement_ids text[],
  renewal_sku_ids text[],
  primary key(application_id,type,id),
  unique(application_id,entitlement_id),
  foreign key(application_id,entitlement_id) references monetization.discord_entitlements(application_id,id),
  foreign key(application_id,sku_id) references monetization.skus(application_id,id),
  check (discord_user_id is null or discord_user_id = purchaser_discord_id),
  check (
    (type='one_time' and entitlement_id is not null and sku_id is not null and kind is not null and consumed is not null
      and status is null and current_period_start is null and current_period_end is null
      and canceled_at is null and entitlement_ids is null and renewal_sku_ids is null)
    or
    (type='subscription' and purchaser_discord_id is not null and status is not null
      and current_period_start is not null and current_period_end is not null and entitlement_ids is not null
      and current_period_end >= current_period_start and entitlement_id is null and sku_id is null
      and kind is null and beneficiary_discord_id is null and guild_id is null and consumed is null)
  )
);
alter table monetization.discord_purchases enable row level security;
revoke all on monetization.discord_purchases from public,anon,authenticated,service_role;
create index discord_purchases_purchaser on monetization.discord_purchases(application_id,purchaser_discord_id,type,id);
create index discord_purchases_guild on monetization.discord_purchases(application_id,guild_id,id) where type='one_time';

insert into monetization.discord_purchases(application_id,type,id,purchaser_discord_id,discord_user_id,title,status,current_period_start,current_period_end,canceled_at,entitlement_ids,renewal_sku_ids,created_at,first_seen_at,observed_at,deleted)
select application_id,'subscription',id,purchaser_discord_id,discord_user_id,title,status,current_period_start,current_period_end,canceled_at,entitlement_ids,renewal_sku_ids,created_at,first_seen_at,observed_at,deleted
from monetization.subscriptions;
insert into monetization.discord_purchases(application_id,type,id,entitlement_id,sku_id,title,kind,purchaser_discord_id,discord_user_id,beneficiary_discord_id,guild_id,consumed,deleted,created_at,first_seen_at,observed_at)
select application_id,'one_time',id,entitlement_id,sku_id,title,kind,purchaser_discord_id,discord_user_id,beneficiary_discord_id,guild_id,consumed,deleted,created_at,first_seen_at,observed_at
from monetization.one_time_purchases;

-- A subscription relationship must never accidentally resolve to a one-time
-- purchase with the same Discord ID. These generated discriminators are immutable.
alter table monetization.discord_entitlements add column subscription_type text generated always as ('subscription'::text) stored;
alter table monetization.discord_subscription_skus add column subscription_type text generated always as ('subscription'::text) stored;
do $$ declare constraint_row record; begin
  for constraint_row in select conrelid::regclass as relation,conname from pg_constraint
    where contype='f' and confrelid='monetization.subscriptions'::regclass
      and conrelid in ('monetization.discord_entitlements'::regclass,'monetization.discord_subscription_skus'::regclass)
  loop
    execute format('alter table %s drop constraint %I',constraint_row.relation,constraint_row.conname);
  end loop;
end $$;
alter table monetization.discord_entitlements add constraint discord_entitlements_subscription_fkey
  foreign key(application_id,subscription_type,subscription_id) references monetization.discord_purchases(application_id,type,id);
alter table monetization.discord_subscription_skus add constraint discord_subscription_skus_purchase_fkey
  foreign key(application_id,subscription_type,subscription_id) references monetization.discord_purchases(application_id,type,id);

-- PL/pgSQL stores SQL bodies as text. Renaming a relation updates its foreign keys
-- and triggers, but not those textual references. Rebind unchanged delivery
-- functions using only the exact old schema-qualified relation identifiers.
do $$ declare fn record; definition text; rewritten text; begin
  for fn in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where p.prokind='f' and (n.nspname='monetization' or (n.nspname='public' and p.proname like 'monetization_%'))
      and not (n.nspname='monetization' and p.proname in ('apply_subscription','apply_entitlement','read_records','known_purchasers','link_discord_user'))
  loop
    definition := pg_get_functiondef(fn.oid);
    rewritten := replace(replace(replace(replace(replace(definition,
      'monetization.subscription_items','monetization.discord_subscription_skus'),
      'monetization.entitlements','monetization.discord_entitlements'),
      'monetization.sku_actions','monetization.sku_features'),
      'monetization.purchase_fulfillments','monetization.purchase_deliveries'),
      'monetization.feature_grants','monetization.purchase_features');
    if rewritten<>definition then execute rewritten; end if;
  end loop;
end $$;

create or replace function monetization.apply_subscription(r jsonb) returns void language plpgsql security definer set search_path='' as $$
declare app text := r->>'applicationId'; sid text := r->>'id'; uid text := r->>'userId';
  ids text[]; ent_ids text[]; renewal_ids text[]; title_snapshot text; changed boolean;
begin
  perform monetization.assert_application(app);
  perform pg_advisory_xact_lock(hashtextextended(app||':subscription:'||sid,0));
  select array_agg(value) into ids from jsonb_array_elements_text(r->'skuIds');
  select coalesce(array_agg(value),'{}') into ent_ids from jsonb_array_elements_text(r->'entitlementIds');
  if jsonb_typeof(r->'renewalSkuIds')='array' then select array_agg(value) into renewal_ids from jsonb_array_elements_text(r->'renewalSkuIds'); end if;
  if coalesce(cardinality(ids),0) not between 1 and 100 or exists(select from unnest(ids||ent_ids||coalesce(renewal_ids,'{}')) x where x !~ '^[0-9]{1,20}$') then raise exception 'Invalid subscription identifiers'; end if;
  if exists(select from unnest(ids) x where not exists(select from monetization.skus s where s.application_id=app and s.id=x and s.type=5)) then raise exception 'Unknown subscription SKU'; end if;
  if exists(select from monetization.discord_purchases where application_id=app and type='subscription' and id=sid and purchaser_discord_id<>uid) then raise exception 'Subscription purchaser cannot change'; end if;
  if (r->>'deleted')::boolean and exists(select from monetization.discord_purchases where application_id=app and type='subscription' and id=sid) then
    update monetization.discord_purchases set deleted=true,observed_at=greatest(observed_at,(r->>'observedAt')::timestamptz) where application_id=app and type='subscription' and id=sid;
    return;
  end if;
  select string_agg(s.name, ' + ' order by s.id) into title_snapshot from monetization.skus s where s.application_id=app and s.id=any(ids);
  insert into monetization.discord_purchases(application_id,type,id,purchaser_discord_id,discord_user_id,title,status,current_period_start,current_period_end,canceled_at,entitlement_ids,renewal_sku_ids,created_at,observed_at,deleted)
  values(app,'subscription',sid,uid,(select id from public.discord_users where id=uid),title_snapshot,(r->>'status')::smallint,(r->>'currentPeriodStart')::timestamptz,(r->>'currentPeriodEnd')::timestamptz,(r->>'canceledAt')::timestamptz,ent_ids,renewal_ids,(r->>'createdAt')::timestamptz,(r->>'observedAt')::timestamptz,(r->>'deleted')::boolean)
  on conflict(application_id,type,id) do update set status=excluded.status,current_period_start=excluded.current_period_start,current_period_end=excluded.current_period_end,canceled_at=excluded.canceled_at,entitlement_ids=excluded.entitlement_ids,renewal_sku_ids=excluded.renewal_sku_ids,observed_at=excluded.observed_at,deleted=excluded.deleted,discord_user_id=coalesce(excluded.discord_user_id,monetization.discord_purchases.discord_user_id)
  where monetization.discord_purchases.observed_at<excluded.observed_at and not monetization.discord_purchases.deleted;
  changed := found;
  if not changed then return; end if;
  update monetization.discord_subscription_skus set is_current=false where application_id=app and subscription_id=sid;
  insert into monetization.discord_subscription_skus(application_id,subscription_id,sku_id,title)
    select app,sid,s.id,s.name from monetization.skus s where s.application_id=app and s.id=any(ids)
    on conflict(application_id,subscription_id,sku_id) do update set is_current=true;
  update monetization.discord_entitlements set subscription_id=sid where application_id=app and id=any(ent_ids)
    and (beneficiary_discord_id is null or beneficiary_discord_id=uid) and sku_id=any(ids) and (subscription_id is null or subscription_id=sid);
end $$;

create or replace function monetization.apply_entitlement(r jsonb) returns void language plpgsql security definer set search_path='' as $$
declare app text := r->>'applicationId'; eid text := r->>'id'; sku text := r->>'skuId';
  uid text := r->>'userId'; gid text := r->>'guildId'; sku_row monetization.skus; sid text;
  purchaser text; changed boolean;
begin
  perform monetization.assert_application(app);
  perform pg_advisory_xact_lock(hashtextextended(app||':entitlement:'||eid,0));
  select * into strict sku_row from monetization.skus where application_id=app and id=sku;
  if exists(select from monetization.discord_entitlements e where e.application_id=app and e.id=eid and
    (e.sku_id<>sku or e.beneficiary_discord_id is distinct from uid or e.guild_id is distinct from gid or e.type<>(r->>'type')::smallint)) then raise exception 'Entitlement identity cannot change'; end if;
  if (r->>'deleted')::boolean and exists(select from monetization.discord_entitlements where application_id=app and id=eid) then
    update monetization.discord_entitlements set deleted=true,observed_at=greatest(observed_at,(r->>'observedAt')::timestamptz) where application_id=app and id=eid;
    update monetization.discord_purchases set deleted=true,observed_at=greatest(observed_at,(r->>'observedAt')::timestamptz) where application_id=app and type='one_time' and id=eid;
    return;
  end if;
  select s.id into sid from monetization.discord_purchases s where s.type='subscription' and s.application_id=app and eid=any(s.entitlement_ids)
    and (uid is null or s.purchaser_discord_id=uid) and exists(select from monetization.discord_subscription_skus i where i.application_id=app and i.subscription_id=s.id and i.sku_id=sku)
    order by s.id limit 1;
  insert into monetization.discord_entitlements(application_id,id,sku_id,beneficiary_discord_id,guild_id,type,starts_at,ends_at,consumed,deleted,created_at,observed_at,subscription_id)
  values(app,eid,sku,uid,gid,(r->>'type')::smallint,(r->>'startsAt')::timestamptz,(r->>'endsAt')::timestamptz,(r->>'consumed')::boolean,(r->>'deleted')::boolean,(r->>'createdAt')::timestamptz,(r->>'observedAt')::timestamptz,sid)
  on conflict(application_id,id) do update set starts_at=excluded.starts_at,ends_at=excluded.ends_at,consumed=monetization.discord_entitlements.consumed or excluded.consumed,deleted=excluded.deleted,observed_at=excluded.observed_at,subscription_id=coalesce(monetization.discord_entitlements.subscription_id,excluded.subscription_id)
    where monetization.discord_entitlements.observed_at<excluded.observed_at and not monetization.discord_entitlements.deleted;
  changed := found;
  if not changed or sku_row.type=5 then return; end if;
  -- PURCHASE is the only OTP source establishing the beneficiary as purchaser.
  -- Gifts, free grants and test purchases retain a NULL purchaser.
  purchaser := case when (r->>'type')::integer=1 then uid else null end;
  insert into monetization.discord_purchases(application_id,type,id,entitlement_id,sku_id,title,kind,purchaser_discord_id,discord_user_id,beneficiary_discord_id,guild_id,consumed,deleted,created_at,observed_at)
  select app,'one_time',eid,eid,sku,sku_row.name,case sku_row.type when 2 then 'durable' else 'consumable' end,purchaser,(select id from public.discord_users where id=purchaser),uid,gid,e.consumed,e.deleted,e.created_at,e.observed_at
  from monetization.discord_entitlements e where e.application_id=app and e.id=eid
  on conflict(application_id,type,id) do update set consumed=excluded.consumed,deleted=excluded.deleted,observed_at=excluded.observed_at,
    purchaser_discord_id=coalesce(monetization.discord_purchases.purchaser_discord_id,excluded.purchaser_discord_id),discord_user_id=coalesce(monetization.discord_purchases.discord_user_id,excluded.discord_user_id);
end $$;

create or replace function monetization.read_records(kind text, app text, user_id text default null, guild text default null, after_id text default null, page_size integer default 100)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  perform monetization.assert_application(app);
  if page_size is null or page_size not between 1 and 100 then raise exception 'Invalid page size'; end if;
  if kind='subscriptions' then
    select coalesce(jsonb_agg(to_jsonb(x)||jsonb_build_object('items',(select coalesce(jsonb_agg(jsonb_build_object('sku_id',i.sku_id,'title',i.title,'is_current',i.is_current) order by i.sku_id),'[]') from monetization.discord_subscription_skus i where i.application_id=app and i.subscription_id=x.id))),'[]') into result from (
      select s.application_id,s.id,s.purchaser_discord_id,s.discord_user_id,s.title,s.status,s.current_period_start,s.current_period_end,s.canceled_at,s.entitlement_ids,s.renewal_sku_ids,s.created_at,s.first_seen_at,s.observed_at,s.deleted from monetization.discord_purchases s where s.type='subscription' and s.application_id=app and (user_id is null or s.purchaser_discord_id=user_id)
        and (guild is null or exists(select from monetization.discord_entitlements e where e.application_id=app and e.subscription_id=s.id and e.guild_id=guild))
        and (after_id is null or s.id>after_id) order by s.id limit page_size) x;
  elsif kind='one_time_purchases' then
    select coalesce(jsonb_agg(to_jsonb(x)),'[]') into result from (
      select p.application_id,p.id,p.entitlement_id,p.sku_id,p.title,p.kind,p.purchaser_discord_id,p.discord_user_id,p.beneficiary_discord_id,p.guild_id,p.consumed,p.deleted,p.created_at,p.first_seen_at,p.observed_at from monetization.discord_purchases p where p.type='one_time' and p.application_id=app and (user_id is null or p.purchaser_discord_id=user_id)
        and (guild is null or p.guild_id=guild) and (after_id is null or p.id>after_id) order by p.id limit page_size) x;
  else raise exception 'Invalid record type'; end if;
  return result;
end $$;

create or replace function monetization.known_purchasers(app text, after_id text default null, page_size integer default 100) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  perform monetization.assert_application(app);
  if page_size is null or page_size not between 1 and 100 then raise exception 'Invalid page size'; end if;
  select coalesce(jsonb_agg(uid),'[]') into result from (
    select uid from (select purchaser_discord_id uid from monetization.discord_purchases where application_id=app
      union select beneficiary_discord_id from monetization.discord_entitlements where application_id=app) users
    where uid is not null and (after_id is null or uid>after_id) order by uid limit page_size
  ) x;
  return result;
end $$;

create or replace function monetization.link_discord_user() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  update monetization.discord_purchases set discord_user_id=new.id where purchaser_discord_id=new.id and discord_user_id is null;
  return new;
end $$;

-- The copied rows and typed foreign keys are in place before retiring old storage.
-- No CASCADE: an unexpected external dependency makes the transaction fail safely.
do $$ begin
  if (select count(*) from monetization.subscriptions) <>
      (select count(*) from monetization.discord_purchases where type='subscription')
    or exists(
      select to_jsonb(s) from monetization.subscriptions s
      except all
      select to_jsonb(jsonb_populate_record(null::monetization.subscriptions,to_jsonb(p)))
        from monetization.discord_purchases p where p.type='subscription'
    ) then raise exception 'Subscription data changed during purchase consolidation'; end if;
  if (select count(*) from monetization.one_time_purchases) <>
      (select count(*) from monetization.discord_purchases where type='one_time')
    or exists(
      select to_jsonb(p) from monetization.one_time_purchases p
      except all
      select to_jsonb(jsonb_populate_record(null::monetization.one_time_purchases,to_jsonb(p)))
        from monetization.discord_purchases p where p.type='one_time'
    ) then raise exception 'One-time purchase data changed during purchase consolidation'; end if;
end $$;
drop table monetization.one_time_purchases;
drop table monetization.subscriptions;
notify pgrst, 'reload schema';
commit;
