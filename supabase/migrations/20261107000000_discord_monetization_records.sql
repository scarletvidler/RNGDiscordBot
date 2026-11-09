-- Private records only. Provision dedicated LOGINs separately; never give the bot
-- postgres/service_role credentials for this path. Bind each LOGIN to its app below.
create schema monetization;
revoke all on schema monetization from public, anon, authenticated, service_role;
do $$ begin
  if not exists (select from pg_roles where rolname = 'monetization_writer') then create role monetization_writer nologin; end if;
  if not exists (select from pg_roles where rolname = 'monetization_reader') then create role monetization_reader nologin; end if;
  if not exists (select from pg_roles where rolname = 'monetization_finance') then create role monetization_finance nologin; end if;
end $$;
grant usage on schema monetization to monetization_writer, monetization_reader, monetization_finance;

create table monetization.login_applications (
  login_role name not null,
  application_id text not null check (application_id ~ '^[0-9]{1,20}$'),
  primary key (login_role, application_id)
);
create table monetization.skus (
  application_id text not null check (application_id ~ '^[0-9]{1,20}$'),
  id text not null check (id ~ '^[0-9]{1,20}$'),
  name text not null check (length(name) between 1 and 512),
  type smallint not null check (type in (2,3,5)), flags bigint not null check (flags >= 0),
  observed_at timestamptz not null, primary key (application_id,id)
);
create table monetization.subscriptions (
  application_id text not null, id text not null check (id ~ '^[0-9]{1,20}$'),
  purchaser_discord_id text not null check (purchaser_discord_id ~ '^[0-9]{1,20}$'),
  discord_user_id text references public.discord_users(id) on delete set null,
  title text not null, status smallint not null check (status in (0,1,2)),
  current_period_start timestamptz not null, current_period_end timestamptz not null,
  canceled_at timestamptz, entitlement_ids text[] not null, renewal_sku_ids text[],
  created_at timestamptz not null, first_seen_at timestamptz not null default now(),
  observed_at timestamptz not null, deleted boolean not null default false,
  amount_minor bigint check (amount_minor >= 0), currency text,
  latest_payment_at timestamptz,
  primary key(application_id,id),
  check (current_period_end >= current_period_start),
  check ((amount_minor is null and currency is null) or (amount_minor is not null and currency is not null and currency ~ '^[A-Z]{3}$')),
  check (discord_user_id is null or discord_user_id = purchaser_discord_id)
);
create table monetization.subscription_items (
  application_id text not null, subscription_id text not null, sku_id text not null,
  title text not null, is_current boolean not null default true,
  primary key(application_id,subscription_id,sku_id),
  foreign key(application_id,subscription_id) references monetization.subscriptions(application_id,id),
  foreign key(application_id,sku_id) references monetization.skus(application_id,id)
);
create table monetization.entitlements (
  application_id text not null, id text not null check (id ~ '^[0-9]{1,20}$'),
  sku_id text not null, beneficiary_discord_id text check (beneficiary_discord_id ~ '^[0-9]{1,20}$'),
  guild_id text check (guild_id ~ '^[0-9]{1,20}$'), type smallint not null check (type between 1 and 255),
  starts_at timestamptz, ends_at timestamptz, consumed boolean not null,
  deleted boolean not null, created_at timestamptz not null, observed_at timestamptz not null,
  subscription_id text,
  primary key(application_id,id),
  foreign key(application_id,sku_id) references monetization.skus(application_id,id),
  foreign key(application_id,subscription_id) references monetization.subscriptions(application_id,id),
  check (beneficiary_discord_id is not null or guild_id is not null)
);
create table monetization.one_time_purchases (
  application_id text not null, id text not null, entitlement_id text not null,
  sku_id text not null, title text not null, kind text not null check (kind in ('durable','consumable')),
  purchaser_discord_id text check (purchaser_discord_id ~ '^[0-9]{1,20}$'),
  discord_user_id text references public.discord_users(id) on delete set null,
  beneficiary_discord_id text, guild_id text, consumed boolean not null,
  deleted boolean not null, created_at timestamptz not null,
  first_seen_at timestamptz not null default now(), observed_at timestamptz not null,
  amount_minor bigint check(amount_minor >= 0), currency text,
  latest_payment_at timestamptz,
  primary key(application_id,id), unique(application_id,entitlement_id),
  foreign key(application_id,entitlement_id) references monetization.entitlements(application_id,id),
  foreign key(application_id,sku_id) references monetization.skus(application_id,id),
  check ((amount_minor is null and currency is null) or (amount_minor is not null and currency is not null and currency ~ '^[A-Z]{3}$')),
  check (discord_user_id is null or discord_user_id = purchaser_discord_id)
);
create table monetization.payments (
  id uuid primary key default gen_random_uuid(), application_id text not null,
  source text not null check(length(source) between 1 and 512),
  source_payment_id text not null check(length(source_payment_id) between 1 and 512),
  subscription_id text, one_time_purchase_id text,
  purchaser_discord_id text not null check(purchaser_discord_id ~ '^[0-9]{1,20}$'),
  title text not null check(length(title) between 1 and 512),
  amount_minor bigint check(amount_minor >= 0), currency text, paid_at timestamptz,
  status text not null check(status in ('paid','refunded','partially_refunded')),
  verified_at timestamptz not null, source_reference text not null check(length(source_reference) between 1 and 512),
  recorded_at timestamptz not null default now(),
  unique(application_id,source,source_payment_id), unique(application_id,id),
  foreign key(application_id,subscription_id) references monetization.subscriptions(application_id,id),
  foreign key(application_id,one_time_purchase_id) references monetization.one_time_purchases(application_id,id),
  check (num_nonnulls(subscription_id,one_time_purchase_id)=1),
  check ((amount_minor is null and currency is null) or (amount_minor is not null and currency is not null and currency ~ '^[A-Z]{3}$'))
);
create table monetization.payment_items (
  application_id text not null, payment_id uuid not null, sku_id text not null,
  title text not null check(length(title) between 1 and 512),
  primary key(application_id,payment_id,sku_id),
  foreign key(application_id,payment_id) references monetization.payments(application_id,id),
  foreign key(application_id,sku_id) references monetization.skus(application_id,id)
);
create index subscriptions_purchaser on monetization.subscriptions(application_id,purchaser_discord_id,id);
create index entitlements_user on monetization.entitlements(application_id,beneficiary_discord_id,id);
create index entitlements_guild on monetization.entitlements(application_id,guild_id,id);
create index entitlements_subscription on monetization.entitlements(application_id,subscription_id);
create index purchases_purchaser on monetization.one_time_purchases(application_id,purchaser_discord_id,id);
create index purchases_guild on monetization.one_time_purchases(application_id,guild_id,id);
create index payments_purchaser on monetization.payments(application_id,purchaser_discord_id,id);
create index payments_subscription on monetization.payments(application_id,subscription_id);
create index payments_purchase on monetization.payments(application_id,one_time_purchase_id);

create function monetization.assert_application(app text) returns void language plpgsql security definer set search_path='' as $$
begin
  if app is null or app !~ '^[0-9]{1,20}$' or not exists (
    select from monetization.login_applications where login_role=session_user and application_id=app
  ) then raise exception 'Monetization application access denied' using errcode='42501'; end if;
end $$;

create function monetization.upsert_skus(records jsonb) returns void language plpgsql security definer set search_path='' as $$
declare r jsonb;
begin
  if jsonb_typeof(records) is distinct from 'array' or jsonb_array_length(records)>100 then raise exception 'Invalid SKU batch'; end if;
  for r in select value from jsonb_array_elements(records) loop
    perform monetization.assert_application(r->>'applicationId');
    insert into monetization.skus values(r->>'applicationId',r->>'id',r->>'name',(r->>'type')::smallint,(r->>'flags')::bigint,(r->>'observedAt')::timestamptz)
    on conflict(application_id,id) do update set name=excluded.name, flags=excluded.flags, observed_at=excluded.observed_at
      where monetization.skus.observed_at < excluded.observed_at and monetization.skus.type=excluded.type;
  end loop;
end $$;

create function monetization.apply_subscription(r jsonb) returns void language plpgsql security definer set search_path='' as $$
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
  if exists(select from monetization.subscriptions where application_id=app and id=sid and purchaser_discord_id<>uid) then raise exception 'Subscription purchaser cannot change'; end if;
  if (r->>'deleted')::boolean and exists(select from monetization.subscriptions where application_id=app and id=sid) then
    update monetization.subscriptions set deleted=true,observed_at=greatest(observed_at,(r->>'observedAt')::timestamptz) where application_id=app and id=sid;
    return;
  end if;
  select string_agg(s.name, ' + ' order by s.id) into title_snapshot from monetization.skus s where s.application_id=app and s.id=any(ids);
  insert into monetization.subscriptions(application_id,id,purchaser_discord_id,discord_user_id,title,status,current_period_start,current_period_end,canceled_at,entitlement_ids,renewal_sku_ids,created_at,observed_at,deleted)
  values(app,sid,uid,(select id from public.discord_users where id=uid),title_snapshot,(r->>'status')::smallint,(r->>'currentPeriodStart')::timestamptz,(r->>'currentPeriodEnd')::timestamptz,(r->>'canceledAt')::timestamptz,ent_ids,renewal_ids,(r->>'createdAt')::timestamptz,(r->>'observedAt')::timestamptz,(r->>'deleted')::boolean)
  on conflict(application_id,id) do update set status=excluded.status,current_period_start=excluded.current_period_start,current_period_end=excluded.current_period_end,canceled_at=excluded.canceled_at,entitlement_ids=excluded.entitlement_ids,renewal_sku_ids=excluded.renewal_sku_ids,observed_at=excluded.observed_at,deleted=excluded.deleted,discord_user_id=coalesce(excluded.discord_user_id,monetization.subscriptions.discord_user_id)
  where monetization.subscriptions.observed_at<excluded.observed_at and not monetization.subscriptions.deleted;
  changed := found;
  if not changed then return; end if;
  update monetization.subscription_items set is_current=false where application_id=app and subscription_id=sid;
  insert into monetization.subscription_items(application_id,subscription_id,sku_id,title)
    select app,sid,s.id,s.name from monetization.skus s where s.application_id=app and s.id=any(ids)
    on conflict(application_id,subscription_id,sku_id) do update set is_current=true;
  update monetization.entitlements set subscription_id=sid where application_id=app and id=any(ent_ids)
    and (beneficiary_discord_id is null or beneficiary_discord_id=uid) and sku_id=any(ids) and (subscription_id is null or subscription_id=sid);
end $$;

create function monetization.apply_entitlement(r jsonb) returns void language plpgsql security definer set search_path='' as $$
declare app text := r->>'applicationId'; eid text := r->>'id'; sku text := r->>'skuId';
  uid text := r->>'userId'; gid text := r->>'guildId'; sku_row monetization.skus; sid text;
  purchaser text; changed boolean;
begin
  perform monetization.assert_application(app);
  perform pg_advisory_xact_lock(hashtextextended(app||':entitlement:'||eid,0));
  select * into strict sku_row from monetization.skus where application_id=app and id=sku;
  if exists(select from monetization.entitlements e where e.application_id=app and e.id=eid and
    (e.sku_id<>sku or e.beneficiary_discord_id is distinct from uid or e.guild_id is distinct from gid or e.type<>(r->>'type')::smallint)) then raise exception 'Entitlement identity cannot change'; end if;
  if (r->>'deleted')::boolean and exists(select from monetization.entitlements where application_id=app and id=eid) then
    update monetization.entitlements set deleted=true,observed_at=greatest(observed_at,(r->>'observedAt')::timestamptz) where application_id=app and id=eid;
    update monetization.one_time_purchases set deleted=true,observed_at=greatest(observed_at,(r->>'observedAt')::timestamptz) where application_id=app and id=eid;
    return;
  end if;
  select s.id into sid from monetization.subscriptions s where s.application_id=app and eid=any(s.entitlement_ids)
    and (uid is null or s.purchaser_discord_id=uid) and exists(select from monetization.subscription_items i where i.application_id=app and i.subscription_id=s.id and i.sku_id=sku)
    order by s.id limit 1;
  insert into monetization.entitlements(application_id,id,sku_id,beneficiary_discord_id,guild_id,type,starts_at,ends_at,consumed,deleted,created_at,observed_at,subscription_id)
  values(app,eid,sku,uid,gid,(r->>'type')::smallint,(r->>'startsAt')::timestamptz,(r->>'endsAt')::timestamptz,(r->>'consumed')::boolean,(r->>'deleted')::boolean,(r->>'createdAt')::timestamptz,(r->>'observedAt')::timestamptz,sid)
  on conflict(application_id,id) do update set starts_at=excluded.starts_at,ends_at=excluded.ends_at,consumed=monetization.entitlements.consumed or excluded.consumed,deleted=excluded.deleted,observed_at=excluded.observed_at,subscription_id=coalesce(monetization.entitlements.subscription_id,excluded.subscription_id)
    where monetization.entitlements.observed_at<excluded.observed_at and not monetization.entitlements.deleted;
  changed := found;
  if not changed or sku_row.type=5 then return; end if;
  -- PURCHASE is the only OTP source establishing the beneficiary as purchaser.
  -- Gifts, free grants and test purchases retain a NULL purchaser until verified finance data arrives.
  purchaser := case when (r->>'type')::integer=1 then uid else null end;
  insert into monetization.one_time_purchases(application_id,id,entitlement_id,sku_id,title,kind,purchaser_discord_id,discord_user_id,beneficiary_discord_id,guild_id,consumed,deleted,created_at,observed_at)
  select app,eid,eid,sku,sku_row.name,case sku_row.type when 2 then 'durable' else 'consumable' end,purchaser,(select id from public.discord_users where id=purchaser),uid,gid,e.consumed,e.deleted,e.created_at,e.observed_at
  from monetization.entitlements e where e.application_id=app and e.id=eid
  on conflict(application_id,id) do update set consumed=excluded.consumed,deleted=excluded.deleted,observed_at=excluded.observed_at,
    purchaser_discord_id=coalesce(monetization.one_time_purchases.purchaser_discord_id,excluded.purchaser_discord_id),discord_user_id=coalesce(monetization.one_time_purchases.discord_user_id,excluded.discord_user_id);
end $$;

create function monetization.known_subscriptions(app text, after_id text default null, page_size integer default 100) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  perform monetization.assert_application(app);
  if page_size is null or page_size not between 1 and 100 then raise exception 'Invalid page size'; end if;
  select coalesce(jsonb_agg(x),'[]') into result from (
    select s.id,s.purchaser_discord_id as "userId",coalesce((select jsonb_agg(i.sku_id order by i.sku_id) from monetization.subscription_items i where i.application_id=app and i.subscription_id=s.id and i.is_current),'[]') as "skuIds"
    from monetization.subscriptions s where s.application_id=app and not s.deleted and (after_id is null or s.id>after_id) order by s.id limit page_size
  ) x;
  return result;
end $$;
create function monetization.known_purchasers(app text, after_id text default null, page_size integer default 100) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  perform monetization.assert_application(app);
  if page_size is null or page_size not between 1 and 100 then raise exception 'Invalid page size'; end if;
  select coalesce(jsonb_agg(uid),'[]') into result from (
    select uid from (select purchaser_discord_id uid from monetization.subscriptions where application_id=app
      union select beneficiary_discord_id from monetization.entitlements where application_id=app
      union select purchaser_discord_id from monetization.one_time_purchases where application_id=app) users
    where uid is not null and (after_id is null or uid>after_id) order by uid limit page_size
  ) x; return result;
end $$;

create function monetization.read_records(kind text, app text, user_id text default null, guild text default null, after_id text default null, page_size integer default 100)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  perform monetization.assert_application(app);
  if page_size is null or page_size not between 1 and 100 then raise exception 'Invalid page size'; end if;
  if kind='subscriptions' then
    select coalesce(jsonb_agg(to_jsonb(x)||jsonb_build_object('amount_minor',x.amount_minor::text,'items',(select coalesce(jsonb_agg(jsonb_build_object('sku_id',i.sku_id,'title',i.title,'is_current',i.is_current) order by i.sku_id),'[]') from monetization.subscription_items i where i.application_id=app and i.subscription_id=x.id))),'[]') into result from (
      select s.* from monetization.subscriptions s where s.application_id=app and (user_id is null or s.purchaser_discord_id=user_id)
        and (guild is null or exists(select from monetization.entitlements e where e.application_id=app and e.subscription_id=s.id and e.guild_id=guild))
        and (after_id is null or s.id>after_id) order by s.id limit page_size) x;
  elsif kind='one_time_purchases' then
    select coalesce(jsonb_agg(to_jsonb(x)||jsonb_build_object('amount_minor',x.amount_minor::text)),'[]') into result from (
      select p.* from monetization.one_time_purchases p where p.application_id=app and (user_id is null or p.purchaser_discord_id=user_id)
        and (guild is null or p.guild_id=guild) and (after_id is null or p.id>after_id) order by p.id limit page_size) x;
  elsif kind='payments' then
    select coalesce(jsonb_agg(to_jsonb(x)||jsonb_build_object('amount_minor',x.amount_minor::text,'items',(select coalesce(jsonb_agg(jsonb_build_object('sku_id',i.sku_id,'title',i.title) order by i.sku_id),'[]') from monetization.payment_items i where i.application_id=app and i.payment_id=x.id))),'[]') into result from (
      select p.* from monetization.payments p where p.application_id=app and (user_id is null or p.purchaser_discord_id=user_id)
        and (guild is null or exists(select from monetization.entitlements e where e.application_id=app and e.guild_id=guild and (e.subscription_id=p.subscription_id or e.id=p.one_time_purchase_id)))
        and (after_id is null or p.id::text>after_id) order by p.id limit page_size) x;
  else raise exception 'Invalid record type'; end if;
  return result;
end $$;

-- Only the finance role may import verified money. Gateway writers cannot call this.
create function monetization.record_verified_payment(r jsonb) returns void language plpgsql security definer set search_path='' as $$
declare app text:=r->>'applicationId'; sub text:=r->>'subscriptionId'; purchase text:=r->>'oneTimePurchaseId';
  purchaser text:=r->>'purchaserDiscordId'; pid uuid; previous monetization.payments; item jsonb; existing_items jsonb; incoming_items jsonb;
begin
  perform monetization.assert_application(app);
  if num_nonnulls(sub,purchase)<>1 then raise exception 'Payment requires exactly one parent'; end if;
  if jsonb_typeof(r->'items') is distinct from 'array' or jsonb_array_length(r->'items') not between 1 and 100 then raise exception 'Payment requires SKU items'; end if;
  perform pg_advisory_xact_lock(hashtextextended(app||':payment:'||(r->>'source')||':'||(r->>'sourcePaymentId'),0));
  if sub is not null then
    perform 1 from monetization.subscriptions where application_id=app and id=sub for update;
    if not exists(select from monetization.subscriptions where application_id=app and id=sub and purchaser_discord_id=purchaser) then raise exception 'Payment purchaser does not match subscription'; end if;
  else
    perform 1 from monetization.one_time_purchases where application_id=app and id=purchase for update;
    if not exists(select from monetization.one_time_purchases where application_id=app and id=purchase and (purchaser_discord_id is null or purchaser_discord_id=purchaser)) then raise exception 'Payment purchaser does not match purchase'; end if;
  end if;
  for item in select value from jsonb_array_elements(r->'items') loop
    if sub is not null and not exists(select from monetization.subscription_items where application_id=app and subscription_id=sub and sku_id=item->>'skuId') then raise exception 'Payment SKU does not match subscription'; end if;
    if purchase is not null and not exists(select from monetization.one_time_purchases where application_id=app and id=purchase and sku_id=item->>'skuId') then raise exception 'Payment SKU does not match purchase'; end if;
  end loop;
  select * into previous from monetization.payments where application_id=app and source=r->>'source' and source_payment_id=r->>'sourcePaymentId';
  if found then
    if previous.subscription_id is distinct from sub or previous.one_time_purchase_id is distinct from purchase or previous.purchaser_discord_id<>purchaser
      or (previous.amount_minor is not null and previous.amount_minor is distinct from (r->>'amountMinor')::bigint)
      or (previous.currency is not null and previous.currency is distinct from r->>'currency')
      or previous.title<>r->>'title' or (previous.paid_at is not null and previous.paid_at is distinct from (r->>'paidAt')::timestamptz) then raise exception 'Immutable payment fields conflict'; end if;
    select jsonb_agg(jsonb_build_object('skuId',sku_id,'title',title) order by sku_id) into existing_items from monetization.payment_items where application_id=app and payment_id=previous.id;
    select jsonb_agg(jsonb_build_object('skuId',value->>'skuId','title',value->>'title') order by value->>'skuId') into incoming_items from jsonb_array_elements(r->'items');
    if existing_items is distinct from incoming_items then raise exception 'Immutable payment items conflict'; end if;
    if previous.verified_at >= (r->>'verifiedAt')::timestamptz then return; end if;
    if (previous.status='refunded' and r->>'status'<>'refunded') or (previous.status='partially_refunded' and r->>'status'='paid') then raise exception 'Refund state cannot regress'; end if;
    update monetization.payments set status=r->>'status',verified_at=(r->>'verifiedAt')::timestamptz,source_reference=r->>'sourceReference',amount_minor=(r->>'amountMinor')::bigint,currency=r->>'currency',paid_at=(r->>'paidAt')::timestamptz where id=previous.id;
  else
  insert into monetization.payments(application_id,source,source_payment_id,subscription_id,one_time_purchase_id,purchaser_discord_id,title,amount_minor,currency,paid_at,status,verified_at,source_reference)
  values(app,r->>'source',r->>'sourcePaymentId',sub,purchase,purchaser,r->>'title',(r->>'amountMinor')::bigint,r->>'currency',(r->>'paidAt')::timestamptz,r->>'status',(r->>'verifiedAt')::timestamptz,r->>'sourceReference') returning id into pid;
  insert into monetization.payment_items select app,pid,value->>'skuId',value->>'title' from jsonb_array_elements(r->'items');
  end if;
  if sub is not null then
    update monetization.subscriptions set amount_minor=(r->>'amountMinor')::bigint,currency=r->>'currency',latest_payment_at=(r->>'paidAt')::timestamptz
    where application_id=app and id=sub and r->>'status'='paid' and (r->>'paidAt') is not null and (latest_payment_at is null or latest_payment_at<(r->>'paidAt')::timestamptz or (latest_payment_at=(r->>'paidAt')::timestamptz and amount_minor is null));
  else
    update monetization.one_time_purchases set purchaser_discord_id=purchaser,discord_user_id=(select id from public.discord_users where id=purchaser) where application_id=app and id=purchase;
    update monetization.one_time_purchases set amount_minor=(r->>'amountMinor')::bigint,currency=r->>'currency',latest_payment_at=(r->>'paidAt')::timestamptz
    where application_id=app and id=purchase and r->>'status'='paid' and (r->>'paidAt') is not null and (latest_payment_at is null or latest_payment_at<(r->>'paidAt')::timestamptz or (latest_payment_at=(r->>'paidAt')::timestamptz and amount_minor is null));
  end if;
end $$;

-- Profiles may arrive after a Gateway record. Link them without fabricating names.
create function monetization.link_discord_user() returns trigger language plpgsql security definer set search_path='' as $$
begin
  update monetization.subscriptions set discord_user_id=new.id where purchaser_discord_id=new.id and discord_user_id is null;
  update monetization.one_time_purchases set discord_user_id=new.id where purchaser_discord_id=new.id and discord_user_id is null;
  return new;
end $$;
create trigger monetization_link_discord_user after insert on public.discord_users for each row execute function monetization.link_discord_user();

-- No exposed tables, no inherited default function execution, no RLS bypass role.
do $$ declare t record; begin
  for t in select tablename from pg_tables where schemaname='monetization' loop
    execute format('alter table monetization.%I enable row level security',t.tablename);
  end loop;
end $$;
revoke all on all tables in schema monetization from public, anon, authenticated, service_role, monetization_writer, monetization_reader, monetization_finance;
revoke all on all functions in schema monetization from public, anon, authenticated, service_role, monetization_writer, monetization_reader, monetization_finance;
alter default privileges in schema monetization revoke execute on functions from public, anon, authenticated, service_role;
grant execute on function monetization.upsert_skus(jsonb),monetization.apply_subscription(jsonb),monetization.apply_entitlement(jsonb),monetization.known_subscriptions(text,text,integer),monetization.known_purchasers(text,text,integer) to monetization_writer;
grant execute on function monetization.read_records(text,text,text,text,text,integer) to monetization_reader,monetization_writer,monetization_finance;
grant execute on function monetization.record_verified_payment(jsonb) to monetization_finance;
