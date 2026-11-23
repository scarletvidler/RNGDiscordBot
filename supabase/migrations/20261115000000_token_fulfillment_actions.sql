-- Guild allowance changes and fulfillment completion commit together.
create function monetization.apply_token_action(app text,entitlement text,removing boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  e monetization.entitlements;
  f monetization.purchase_fulfillments;
  quantity_json jsonb;
  quantity_value numeric;
  quantity integer;
  delta integer;
  expected_action text := case when removing then 'remove_tokens' else 'grant_tokens' end;
begin
  perform monetization.assert_application(app);
  -- Same lock order as feature actions and the future dispatcher.
  select * into e from monetization.entitlements p where p.application_id=app and p.id=entitlement for update;
  if not found then raise exception 'Entitlement not found'; end if;
  select * into f from monetization.purchase_fulfillments p where p.application_id=app and p.entitlement_id=entitlement for update;
  if not found then raise exception 'Fulfillment not found'; end if;
  if f.action_snapshot->>(case when removing then 'remove_action' else 'grant_action' end) is distinct from expected_action
    or f.action_snapshot->>'grant_action' is distinct from 'grant_tokens' then
    raise exception 'Fulfillment action does not match token handler';
  end if;
  if removing and f.applied_state='removed' then return to_jsonb(f); end if;
  if not removing then
    if f.desired_state='removed' or f.applied_state='removed' then raise exception 'Fulfillment has been removed'; end if;
    if f.applied_state='granted' then return to_jsonb(f); end if;
    if e.deleted or e.consumed or e.starts_at>now() or e.ends_at<=now() then raise exception 'Entitlement is not eligible for granting'; end if;
  end if;

  -- An undelivered purchase can be removed without touching a guild allowance.
  if not removing or f.applied_state='granted' then
    if f.target_type is distinct from 'guild' or f.target_id is null then
      raise exception 'Token fulfillment requires a guild recipient';
    end if;
    quantity_json := case when removing then f.grant_result->'quantity'
      else f.action_snapshot->'grant_settings'->'quantity' end;
    if jsonb_typeof(quantity_json) is distinct from 'number' then raise exception 'Invalid token quantity'; end if;
    quantity_value := (quantity_json#>>'{}')::numeric;
    if quantity_value < 1 or quantity_value > 2147483647 or trunc(quantity_value)<>quantity_value then
      raise exception 'Invalid token quantity';
    end if;
    quantity := quantity_value::integer;
    delta := case when removing then -quantity else quantity end;
    -- Atomic arithmetic serializes different purchases on the same guild row.
    -- Usage is historical and must never be rewritten when reversing a grant.
    update public.guilds g set token_limit=g.token_limit+delta,
      token_balance=greatest(g.token_limit::bigint+delta-g.token_total_usage,0)::integer
      where g.id=f.target_id;
    if not found then raise exception 'Token recipient guild not found'; end if;
  end if;

  if removing then
    update monetization.purchase_fulfillments p set desired_state='removed',applied_state='removed',
      processing_status='succeeded',removed_at=now(),attempt_count=p.attempt_count+1,last_error=null,next_attempt_at=null
      where p.application_id=app and p.entitlement_id=entitlement returning * into f;
  else
    update monetization.purchase_fulfillments p set applied_state='granted',processing_status='succeeded',
      granted_at=now(),grant_result=jsonb_build_object('quantity',quantity),
      attempt_count=p.attempt_count+1,last_error=null,next_attempt_at=null
      where p.application_id=app and p.entitlement_id=entitlement returning * into f;
  end if;
  return to_jsonb(f);
end $$;

create function public.monetization_grant_tokens(app text,entitlement text) returns jsonb
language sql security definer set search_path='' as $$
  select monetization.apply_token_action(app,entitlement,false);
$$;
create function public.monetization_remove_tokens(app text,entitlement text) returns jsonb
language sql security definer set search_path='' as $$
  select monetization.apply_token_action(app,entitlement,true);
$$;
revoke all on function monetization.apply_token_action(text,text,boolean) from public,anon,authenticated,service_role;
revoke all on function public.monetization_grant_tokens(text,text),public.monetization_remove_tokens(text,text) from public,anon,authenticated,service_role;
grant execute on function public.monetization_grant_tokens(text,text),public.monetization_remove_tokens(text,text) to service_role;
notify pgrst, 'reload schema';
