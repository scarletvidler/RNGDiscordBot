-- Explicit action functions only; event and recovery dispatch are added separately.
create table monetization.feature_grants (
  application_id text not null,
  entitlement_id text not null,
  feature text not null check (feature ~ '^[a-z][a-z0-9_]{0,63}$'),
  target_type text not null check (target_type in ('user','guild')),
  target_id text not null check (target_id ~ '^[0-9]{1,20}$'),
  granted_at timestamptz not null default now(),
  removed_at timestamptz,
  primary key(application_id,entitlement_id,feature),
  foreign key(application_id,entitlement_id)
    references monetization.purchase_fulfillments(application_id,entitlement_id)
);
create index feature_grants_target_idx on monetization.feature_grants(application_id,target_type,target_id)
  where removed_at is null;
alter table monetization.feature_grants enable row level security;
revoke all on monetization.feature_grants from public,anon,authenticated,service_role;

create function monetization.apply_feature_action(app text,entitlement text,removing boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  e monetization.entitlements;
  f monetization.purchase_fulfillments;
  features jsonb;
  expected_action text := case when removing then 'remove_features' else 'grant_features' end;
begin
  perform monetization.assert_application(app);
  -- Always lock the entitlement before its fulfillment, including future dispatchers.
  select * into e from monetization.entitlements p where p.application_id=app and p.id=entitlement for update;
  if not found then raise exception 'Entitlement not found'; end if;
  select * into f from monetization.purchase_fulfillments p where p.application_id=app and p.entitlement_id=entitlement for update;
  if not found then raise exception 'Fulfillment not found'; end if;
  if f.action_snapshot->>(case when removing then 'remove_action' else 'grant_action' end) is distinct from expected_action
    or f.action_snapshot->>'grant_action' is distinct from 'grant_features' then
    raise exception 'Fulfillment action does not match feature handler';
  end if;
  if removing and f.applied_state='removed' then return to_jsonb(f); end if;
  if not removing then
    if f.desired_state='removed' or f.applied_state='removed' then raise exception 'Fulfillment has been removed'; end if;
    if f.applied_state='granted' then return to_jsonb(f); end if;
    if f.target_id is null then raise exception 'Fulfillment recipient is unresolved'; end if;
    if e.deleted or e.consumed or e.starts_at>now() or e.ends_at<=now() then raise exception 'Entitlement is not eligible for granting'; end if;
    features := f.action_snapshot->'grant_settings'->'features';
    if jsonb_typeof(features) is distinct from 'array' then raise exception 'Features must be an array'; end if;
    if jsonb_array_length(features) not between 1 and 64 or exists(
      select from jsonb_array_elements(features) x
      where jsonb_typeof(x) <> 'string' or (x#>>'{}') !~ '^[a-z][a-z0-9_]{0,63}$'
    ) then raise exception 'Invalid feature names'; end if;
    insert into monetization.feature_grants(application_id,entitlement_id,feature,target_type,target_id)
      select app,entitlement,value,f.target_type,f.target_id from jsonb_array_elements_text(features)
      group by value;
    update monetization.purchase_fulfillments p set
      applied_state='granted',processing_status='succeeded',granted_at=now(),
      grant_result=jsonb_build_object('features',features),attempt_count=p.attempt_count+1,last_error=null,next_attempt_at=null
      where p.application_id=app and p.entitlement_id=entitlement returning * into f;
  else
    -- Keep source history and revoke only this purchase's features.
    update monetization.feature_grants p set removed_at=now()
      where p.application_id=app and p.entitlement_id=entitlement and p.removed_at is null;
    update monetization.purchase_fulfillments p set desired_state='removed',applied_state='removed',
      processing_status='succeeded',removed_at=now(),attempt_count=p.attempt_count+1,last_error=null,next_attempt_at=null
      where p.application_id=app and p.entitlement_id=entitlement returning * into f;
  end if;
  return to_jsonb(f);
end $$;

create function public.monetization_grant_features(app text,entitlement text) returns jsonb
language sql security definer set search_path='' as $$
  select monetization.apply_feature_action(app,entitlement,false);
$$;
create function public.monetization_remove_features(app text,entitlement text) returns jsonb
language sql security definer set search_path='' as $$
  select monetization.apply_feature_action(app,entitlement,true);
$$;
create function public.monetization_get_granted_features(app text,target_type text,target_id text) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  perform monetization.assert_application(app);
  if target_type is null or target_type not in ('user','guild') or target_id is null or target_id !~ '^[0-9]{1,20}$' then
    raise exception 'Invalid feature recipient';
  end if;
  return (select coalesce(jsonb_agg(feature order by feature),'[]') from (
    select distinct g.feature from monetization.feature_grants g
    where g.application_id=app and g.target_type=monetization_get_granted_features.target_type
      and g.target_id=monetization_get_granted_features.target_id and g.removed_at is null
  ) active);
end $$;

revoke all on function monetization.apply_feature_action(text,text,boolean) from public,anon,authenticated,service_role;
revoke all on function public.monetization_grant_features(text,text),public.monetization_remove_features(text,text),public.monetization_get_granted_features(text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.monetization_grant_features(text,text),public.monetization_remove_features(text,text),public.monetization_get_granted_features(text,text,text) to service_role;
notify pgrst, 'reload schema';
