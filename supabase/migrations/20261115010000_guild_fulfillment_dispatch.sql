-- Guild-only fulfillment is prepared in the same transaction as purchase recording.
create or replace function public.monetization_create_purchase_fulfillment(app text,entitlement text,target_type text default null,target_id text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare e monetization.entitlements; a monetization.sku_actions; f monetization.purchase_fulfillments;
begin
  perform monetization.assert_application(app);
  select * into e from monetization.entitlements p where p.application_id=app and p.id=entitlement for update;
  if not found then raise exception 'Entitlement not found'; end if;
  if (target_type is null) <> (target_id is null) or
    (target_type is not null and (target_type<>'guild' or target_id is distinct from e.guild_id)) then
    raise exception 'Fulfillment requires the entitlement guild';
  end if;
  select * into f from monetization.purchase_fulfillments p where p.application_id=app and p.entitlement_id=entitlement for update;
  if found then return to_jsonb(f); end if;
  if e.guild_id is null then return null; end if;
  select * into a from monetization.sku_actions p where p.application_id=app and p.sku_id=e.sku_id for share;
  if not found then return null; end if;
  if not a.enabled or e.created_at<a.effective_from or e.deleted or e.consumed
    or e.starts_at>now() or e.ends_at<=now() then return null; end if;
  insert into monetization.purchase_fulfillments(application_id,entitlement_id,sku_id,config_version,action_snapshot,target_type,target_id,processing_status)
  values(app,e.id,e.sku_id,a.version,jsonb_build_object('mode',a.mode,'grant_action',a.grant_action,
    'grant_settings',a.grant_settings,'remove_action',a.remove_action,'remove_settings',a.remove_settings),
    'guild',e.guild_id,'pending') returning * into f;
  return to_jsonb(f);
end $$;

create function monetization.reconcile_fulfillment(app text,entitlement text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e monetization.entitlements; f monetization.purchase_fulfillments; removing boolean;
begin
  perform monetization.assert_application(app);
  select * into e from monetization.entitlements p where p.application_id=app and p.id=entitlement for update;
  if not found then raise exception 'Entitlement not found'; end if;
  if e.guild_id is null then return null; end if;
  perform public.monetization_create_purchase_fulfillment(app,entitlement);
  select * into f from monetization.purchase_fulfillments p where p.application_id=app and p.entitlement_id=entitlement for update;
  if not found then return null; end if;
  -- Preserve old personal/mismatched records for audit, without executing them.
  if f.target_id is not null and (f.target_type<>'guild' or f.target_id<>e.guild_id) then return null; end if;
  if f.target_id is null then
    update monetization.purchase_fulfillments p set target_type='guild',target_id=e.guild_id,processing_status='pending'
      where p.application_id=app and p.entitlement_id=entitlement returning * into f;
  end if;
  removing := e.deleted or (e.ends_at<=now() and
    (f.action_snapshot->>'mode'='while_active' or f.applied_state='ungranted'))
    or (e.consumed and f.applied_state='ungranted');
  if removing and f.desired_state<>'removed' then
    update monetization.purchase_fulfillments p set desired_state='removed',processing_status='pending',
      operation_id=gen_random_uuid(),last_error=null,next_attempt_at=null
      where p.application_id=app and p.entitlement_id=entitlement returning * into f;
  end if;
  -- Removed work stays removed even if a later stale snapshot appears active.
  return to_jsonb(f);
end $$;

create or replace function public.monetization_apply_entitlement(r jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform monetization.apply_entitlement(r);
  perform monetization.reconcile_fulfillment(r->>'applicationId',r->>'id');
end $$;

create function public.monetization_reconcile_fulfillment(app text,entitlement text) returns jsonb
language sql security definer set search_path='' as $$
  select monetization.reconcile_fulfillment(app,entitlement);
$$;

create function public.monetization_fulfillment_entitlements(app text,after_id text default null,page_size integer default 100) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  perform monetization.assert_application(app);
  if page_size is null or page_size not between 1 and 100 then raise exception 'Invalid page size'; end if;
  return (select coalesce(jsonb_agg(id order by id),'[]') from (
    select e.id from monetization.entitlements e where e.application_id=app and e.guild_id is not null
      and (after_id is null or e.id>after_id) order by e.id limit page_size
  ) page);
end $$;

create function public.monetization_fulfillment_failure(app text,entitlement text,operation uuid,error_code text) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform monetization.assert_application(app);
  if error_code is null or error_code not in ('handler_failed','unsupported_action') then raise exception 'Invalid fulfillment error code'; end if;
  -- Completion or a newer lifecycle transition must not be overwritten by an old failure.
  update monetization.purchase_fulfillments p set processing_status='failed',last_error=error_code,
    attempt_count=p.attempt_count+1,next_attempt_at=now()+interval '1 hour'
    where p.application_id=app and p.entitlement_id=entitlement and p.operation_id=operation
      and p.applied_state<>p.desired_state and p.target_type='guild';
end $$;

create function public.monetization_complete_noop_fulfillment(app text,entitlement text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare f monetization.purchase_fulfillments; snapshot jsonb;
begin
  snapshot := monetization.reconcile_fulfillment(app,entitlement);
  if snapshot is null then raise exception 'Guild fulfillment not found'; end if;
  select * into f from monetization.purchase_fulfillments p where p.application_id=app and p.entitlement_id=entitlement for update;
  if f.action_snapshot->>(case when f.desired_state='removed' then 'remove_action' else 'grant_action' end) is distinct from 'none' then
    raise exception 'Fulfillment action is not none';
  end if;
  if f.applied_state=f.desired_state then return to_jsonb(f); end if;
  if f.desired_state='granted' and exists(select from monetization.entitlements e where e.application_id=app and e.id=entitlement
    and (e.deleted or e.consumed or e.starts_at>now() or e.ends_at<=now())) then raise exception 'Entitlement is not eligible for granting'; end if;
  update monetization.purchase_fulfillments p set applied_state=p.desired_state,processing_status='succeeded',
    granted_at=case when p.desired_state='granted' then now() else p.granted_at end,
    removed_at=case when p.desired_state='removed' then now() else p.removed_at end,
    grant_result=case when p.desired_state='granted' then '{}'::jsonb else p.grant_result end,
    attempt_count=p.attempt_count+1,last_error=null,next_attempt_at=null
    where p.application_id=app and p.entitlement_id=entitlement returning * into f;
  return to_jsonb(f);
end $$;

-- Retain old handlers for reversing historical grants, but prohibit new personal grants.
alter function monetization.apply_feature_action(text,text,boolean) rename to apply_feature_action_before_guild_only;
alter function monetization.apply_token_action(text,text,boolean) rename to apply_token_action_before_guild_only;
create function monetization.assert_guild_fulfillment(app text,entitlement text) returns void
language plpgsql security definer set search_path='' as $$
declare e monetization.entitlements; f monetization.purchase_fulfillments;
begin
  perform monetization.assert_application(app);
  select * into e from monetization.entitlements p where p.application_id=app and p.id=entitlement for update;
  select * into f from monetization.purchase_fulfillments p where p.application_id=app and p.entitlement_id=entitlement for update;
  if e.guild_id is null or f.target_type is distinct from 'guild' or f.target_id is distinct from e.guild_id then
    raise exception 'Fulfillment requires the entitlement guild';
  end if;
end $$;
create function monetization.apply_feature_action(app text,entitlement text,removing boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if not removing then perform monetization.assert_guild_fulfillment(app,entitlement); end if;
  return monetization.apply_feature_action_before_guild_only(app,entitlement,removing);
end $$;
create function monetization.apply_token_action(app text,entitlement text,removing boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if not removing then perform monetization.assert_guild_fulfillment(app,entitlement); end if;
  return monetization.apply_token_action_before_guild_only(app,entitlement,removing);
end $$;

-- Rebind public entry points explicitly after renaming the old implementations.
create or replace function public.monetization_grant_features(app text,entitlement text) returns jsonb
language sql security definer set search_path='' as $$
  select monetization.apply_feature_action(app,entitlement,false);
$$;
create or replace function public.monetization_remove_features(app text,entitlement text) returns jsonb
language sql security definer set search_path='' as $$
  select monetization.apply_feature_action(app,entitlement,true);
$$;
create or replace function public.monetization_grant_tokens(app text,entitlement text) returns jsonb
language sql security definer set search_path='' as $$
  select monetization.apply_token_action(app,entitlement,false);
$$;
create or replace function public.monetization_remove_tokens(app text,entitlement text) returns jsonb
language sql security definer set search_path='' as $$
  select monetization.apply_token_action(app,entitlement,true);
$$;

create or replace function public.monetization_get_granted_features(app text,target_type text,target_id text) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  perform monetization.assert_application(app);
  if target_type is distinct from 'guild' or target_id is null or target_id !~ '^[0-9]{1,20}$' then raise exception 'Invalid feature recipient'; end if;
  return (select coalesce(jsonb_agg(feature order by feature),'[]') from (
    select distinct g.feature from monetization.feature_grants g
    join monetization.entitlements e on (e.application_id,e.id)=(g.application_id,g.entitlement_id)
    join monetization.purchase_fulfillments f on (f.application_id,f.entitlement_id)=(g.application_id,g.entitlement_id)
    where g.application_id=app and g.target_type='guild' and g.target_id=monetization_get_granted_features.target_id
      and e.guild_id=g.target_id and g.removed_at is null and not e.deleted and f.desired_state='granted'
      and (e.starts_at is null or e.starts_at<=now())
      and (f.action_snapshot->>'mode'<>'while_active' or e.ends_at is null or e.ends_at>now())
  ) active);
end $$;

revoke all on function monetization.reconcile_fulfillment(text,text),monetization.assert_guild_fulfillment(text,text),monetization.apply_feature_action(text,text,boolean),monetization.apply_token_action(text,text,boolean),monetization.apply_feature_action_before_guild_only(text,text,boolean),monetization.apply_token_action_before_guild_only(text,text,boolean) from public,anon,authenticated,service_role;
revoke all on function public.monetization_reconcile_fulfillment(text,text),public.monetization_fulfillment_entitlements(text,text,integer),public.monetization_fulfillment_failure(text,text,uuid,text),public.monetization_complete_noop_fulfillment(text,text) from public,anon,authenticated,service_role;
grant execute on function public.monetization_reconcile_fulfillment(text,text),public.monetization_fulfillment_entitlements(text,text,integer),public.monetization_fulfillment_failure(text,text,uuid,text),public.monetization_complete_noop_fulfillment(text,text) to service_role;
notify pgrst, 'reload schema';
