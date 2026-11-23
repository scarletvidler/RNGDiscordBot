-- Configuration and durable state only. No purchase handlers or automatic grants.
create table monetization.sku_actions (
  application_id text not null,
  sku_id text not null,
  enabled boolean not null default false,
  mode text not null default 'once' check (mode in ('once','while_active')),
  grant_action text not null default 'none' check (grant_action ~ '^[a-z][a-z0-9_]{0,63}$'),
  grant_settings jsonb not null default '{}' check (jsonb_typeof(grant_settings)='object'),
  remove_action text not null default 'none' check (remove_action ~ '^[a-z][a-z0-9_]{0,63}$'),
  remove_settings jsonb not null default '{}' check (jsonb_typeof(remove_settings)='object'),
  effective_from timestamptz not null default now(),
  version integer not null default 1 check (version>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(application_id,sku_id),
  foreign key(application_id,sku_id) references monetization.skus(application_id,id)
);

create function monetization.version_sku_action() returns trigger
language plpgsql set search_path='' as $$
begin
  if tg_op='INSERT' then
    new.version := 1;
    new.created_at := now();
  else
    if (new.application_id,new.sku_id) is distinct from (old.application_id,old.sku_id) then
      raise exception 'SKU action identity cannot change';
    end if;
    new.created_at := old.created_at;
    new.version := old.version + case when
      (new.enabled,new.mode,new.grant_action,new.grant_settings,new.remove_action,new.remove_settings,new.effective_from)
      is distinct from
      (old.enabled,old.mode,old.grant_action,old.grant_settings,old.remove_action,old.remove_settings,old.effective_from)
      then 1 else 0 end;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger version_sku_action before insert or update on monetization.sku_actions
for each row execute function monetization.version_sku_action();

create table monetization.purchase_fulfillments (
  application_id text not null,
  entitlement_id text not null,
  sku_id text not null,
  config_version integer not null check (config_version>0),
  action_snapshot jsonb not null check (jsonb_typeof(action_snapshot)='object'),
  target_type text check (target_type in ('user','guild')),
  target_id text check (target_id ~ '^[0-9]{1,20}$'),
  desired_state text not null default 'granted' check (desired_state in ('granted','removed')),
  applied_state text not null default 'ungranted' check (applied_state in ('ungranted','granted','removed')),
  processing_status text not null default 'awaiting_recipient'
    check (processing_status in ('pending','running','succeeded','failed','awaiting_recipient')),
  operation_id uuid not null unique default gen_random_uuid(),
  grant_result jsonb,
  attempt_count integer not null default 0 check (attempt_count>=0),
  last_error text,
  next_attempt_at timestamptz,
  granted_at timestamptz,
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(application_id,entitlement_id),
  foreign key(application_id,entitlement_id) references monetization.entitlements(application_id,id),
  foreign key(application_id,sku_id) references monetization.skus(application_id,id),
  check ((target_type is null) = (target_id is null))
);

create function monetization.preserve_fulfillment_identity() returns trigger
language plpgsql set search_path='' as $$
begin
  if (new.application_id,new.entitlement_id,new.sku_id,new.config_version,new.action_snapshot)
    is distinct from (old.application_id,old.entitlement_id,old.sku_id,old.config_version,old.action_snapshot) then
    raise exception 'Fulfillment identity and action snapshot cannot change';
  end if;
  if old.target_id is not null and (new.target_type,new.target_id) is distinct from (old.target_type,old.target_id) then
    raise exception 'Fulfillment recipient cannot change';
  end if;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end $$;
create trigger preserve_fulfillment_identity before update on monetization.purchase_fulfillments
for each row execute function monetization.preserve_fulfillment_identity();

alter table monetization.sku_actions enable row level security;
alter table monetization.purchase_fulfillments enable row level security;
revoke all on monetization.sku_actions,monetization.purchase_fulfillments from public,anon,authenticated,service_role;
revoke all on function monetization.version_sku_action(),monetization.preserve_fulfillment_identity() from public,anon,authenticated,service_role;

create function public.monetization_upsert_sku_action(r jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result monetization.sku_actions;
begin
  perform monetization.assert_application(r->>'application_id');
  insert into monetization.sku_actions(application_id,sku_id,enabled,mode,grant_action,grant_settings,remove_action,remove_settings,effective_from)
  values(r->>'application_id',r->>'sku_id',coalesce((r->>'enabled')::boolean,false),coalesce(r->>'mode','once'),
    coalesce(r->>'grant_action','none'),coalesce(r->'grant_settings','{}'),coalesce(r->>'remove_action','none'),
    coalesce(r->'remove_settings','{}'),coalesce((r->>'effective_from')::timestamptz,now()))
  on conflict(application_id,sku_id) do update set enabled=excluded.enabled,mode=excluded.mode,
    grant_action=excluded.grant_action,grant_settings=excluded.grant_settings,remove_action=excluded.remove_action,
    remove_settings=excluded.remove_settings,effective_from=excluded.effective_from
  returning * into result;
  return to_jsonb(result);
end $$;

create function public.monetization_get_sku_action(app text,sku text) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  perform monetization.assert_application(app);
  return (select to_jsonb(a) from monetization.sku_actions a where a.application_id=app and a.sku_id=sku);
end $$;

-- Explicit preparation only: existing purchase recording never calls this function.
-- A future dispatcher will execute actions and persist completion in a separate step.
create function public.monetization_create_purchase_fulfillment(app text,entitlement text,target_type text default null,target_id text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare e monetization.entitlements; a monetization.sku_actions; f monetization.purchase_fulfillments;
begin
  perform monetization.assert_application(app);
  if (target_type is null) <> (target_id is null) or
    (target_type is not null and (target_type not in ('user','guild') or target_id !~ '^[0-9]{1,20}$')) then
    raise exception 'Invalid fulfillment recipient';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(app||':fulfillment:'||entitlement,0));
  select * into f from monetization.purchase_fulfillments p where p.application_id=app and p.entitlement_id=entitlement;
  if found then return to_jsonb(f); end if;
  select * into e from monetization.entitlements p where p.application_id=app and p.id=entitlement for update;
  if not found then raise exception 'Entitlement not found'; end if;
  if (target_type='user' and e.beneficiary_discord_id is not null and target_id<>e.beneficiary_discord_id)
    or (target_type='guild' and e.guild_id is not null and target_id<>e.guild_id) then
    raise exception 'Fulfillment recipient does not match entitlement';
  end if;
  select * into a from monetization.sku_actions p where p.application_id=app and p.sku_id=e.sku_id for share;
  if not found then return null; end if;
  if not a.enabled or e.created_at<a.effective_from or e.deleted or e.consumed
    or e.starts_at>now() or e.ends_at<=now() then return null; end if;
  insert into monetization.purchase_fulfillments(application_id,entitlement_id,sku_id,config_version,action_snapshot,target_type,target_id,processing_status)
  values(app,e.id,e.sku_id,a.version,jsonb_build_object('mode',a.mode,'grant_action',a.grant_action,
    'grant_settings',a.grant_settings,'remove_action',a.remove_action,'remove_settings',a.remove_settings),
    target_type,target_id,case when target_id is null then 'awaiting_recipient' else 'pending' end)
  returning * into f;
  return to_jsonb(f);
end $$;

create function public.monetization_get_purchase_fulfillment(app text,entitlement text) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  perform monetization.assert_application(app);
  return (select to_jsonb(f) from monetization.purchase_fulfillments f where f.application_id=app and f.entitlement_id=entitlement);
end $$;

revoke all on function public.monetization_upsert_sku_action(jsonb),public.monetization_get_sku_action(text,text),public.monetization_create_purchase_fulfillment(text,text,text,text),public.monetization_get_purchase_fulfillment(text,text) from public,anon,authenticated,service_role;
grant execute on function public.monetization_upsert_sku_action(jsonb),public.monetization_get_sku_action(text,text),public.monetization_create_purchase_fulfillment(text,text,text,text),public.monetization_get_purchase_fulfillment(text,text) to service_role;
notify pgrst, 'reload schema';
