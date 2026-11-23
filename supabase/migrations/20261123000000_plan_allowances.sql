-- Monthly allocations, one-month rollover, and guild-only top-up redemption.
-- Existing balances are unchanged until a plan is delivered or usage is recorded.
begin;

create table monetization.guild_plan_state (
  guild_id text primary key references public.guilds(id) on delete cascade,
  managed_plan boolean not null default false,
  legacy_features boolean not null default false,
  free_paused boolean not null default false,
  paused_free_tokens integer not null default 0 check (paused_free_tokens between 0 and 5000)
);
insert into monetization.guild_plan_state(guild_id,legacy_features)
  select id,true from public.guilds;

create table monetization.guild_token_grants (
  id bigint generated always as identity primary key,
  application_id text not null,
  entitlement_id text not null,
  guild_id text not null,
  kind text not null check (kind in ('plan','topup')),
  period_start timestamptz not null,
  period_end timestamptz,
  expires_at timestamptz,
  quantity integer not null check (quantity>0),
  remaining integer not null check (remaining>=0),
  revoked_quantity integer not null default 0 check (revoked_quantity>=0),
  reversed boolean not null default false,
  created_at timestamptz not null default now(),
  unique(application_id,entitlement_id,period_start),
  foreign key(application_id,entitlement_id) references monetization.discord_entitlements(application_id,id),
  check (remaining<=quantity and revoked_quantity<=quantity and remaining+revoked_quantity<=quantity),
  check ((kind='plan' and period_end is not null and expires_at is not null and period_end>period_start and expires_at>=period_end)
    or (kind='topup' and period_end is null and expires_at is null))
);
create index guild_token_grants_remaining on monetization.guild_token_grants(guild_id,expires_at,id) where remaining>0;

create table monetization.topup_redemptions (
  application_id text not null,
  entitlement_id text not null,
  buyer_id text not null,
  guild_id text not null,
  created_at timestamptz not null default now(),
  primary key(application_id,entitlement_id),
  foreign key(application_id,entitlement_id) references monetization.discord_entitlements(application_id,id)
);

create table monetization.token_usage (
  guild_id text not null,
  operation_id text not null check (length(operation_id) between 1 and 100),
  status text not null check (status in ('reserved','settled','released')),
  quantity integer not null check (quantity>=0),
  estimated boolean not null default false,
  allocations jsonb not null default '[]' check (jsonb_typeof(allocations)='array'),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  primary key(guild_id,operation_id)
);
create index token_usage_reservations on monetization.token_usage(guild_id,expires_at) where status='reserved';

alter table monetization.guild_plan_state enable row level security;
alter table monetization.guild_token_grants enable row level security;
alter table monetization.topup_redemptions enable row level security;
alter table monetization.token_usage enable row level security;
revoke all on monetization.guild_plan_state,monetization.guild_token_grants,monetization.topup_redemptions,monetization.token_usage from public,anon,authenticated,service_role;
revoke all on sequence monetization.guild_token_grants_id_seq from public,anon,authenticated,service_role;

create function monetization.token_grant_is_active(grant_id bigint) returns boolean
language sql security definer set search_path='' as $$
  select coalesce((select not g.reversed and not e.deleted
    and (g.expires_at is null or g.expires_at>now())
    and (g.kind='topup' or (f.desired_state='granted'
      and (e.starts_at is null or e.starts_at<=now()) and (e.ends_at is null or e.ends_at>now())))
    from monetization.guild_token_grants g
    join monetization.discord_entitlements e on (e.application_id,e.id)=(g.application_id,g.entitlement_id)
    join monetization.purchase_deliveries f on (f.application_id,f.entitlement_id)=(g.application_id,g.entitlement_id)
    where g.id=grant_id),false);
$$;

create function monetization.guild_token_state(guild text) returns jsonb
language sql security definer set search_path='' as $$
  select jsonb_build_object('id',g.id,'token_limit',g.token_limit,'token_total_usage',g.token_total_usage,
    'token_balance',greatest(g.token_limit::bigint-g.token_total_usage-h.held,0),
    'has_active_subscription',g.has_active_subscription,'managed_plan',coalesce(s.managed_plan,false),
    'legacy_features',coalesce(s.legacy_features,false),'reserved_tokens',h.held)
  from public.guilds g left join monetization.guild_plan_state s on s.guild_id=g.id
  cross join lateral (select coalesce(sum(u.quantity),0) held from monetization.token_usage u where u.guild_id=g.id and u.status='reserved') h
  where g.id=guild;
$$;

-- The caller holds the guild row. Return unused reservations to their original
-- allocation, never extending expiry or resurrecting refunded credit.
create function monetization.refund_token_allocations(guild text,allocations jsonb,used integer) returns void
language plpgsql security definer set search_path='' as $$
declare allocation jsonb; allocation_used integer; refund integer; left_to_use integer:=used; g monetization.guild_token_grants;
  plan_state monetization.guild_plan_state; pause integer;
begin
  for allocation in select value from jsonb_array_elements(allocations) loop
    allocation_used:=least(left_to_use,(allocation->>'quantity')::integer);
    left_to_use:=left_to_use-allocation_used;
    refund:=(allocation->>'quantity')::integer-allocation_used;
    if refund=0 then continue; end if;
    if allocation->>'grant_id' is null then
      -- A free-credit reservation may predate the first plan purchase. When it
      -- is released, keep that free remainder paused with the rest of its pool.
      select * into plan_state from monetization.guild_plan_state s where s.guild_id=guild for update;
      if found and plan_state.free_paused then
        pause:=least(refund,5000-plan_state.paused_free_tokens);
        update monetization.guild_plan_state set paused_free_tokens=paused_free_tokens+pause where guild_id=guild;
        update public.guilds set token_limit=token_limit-pause where id=guild;
      end if;
      continue;
    end if;
    select * into strict g from monetization.guild_token_grants p where p.id=(allocation->>'grant_id')::bigint and p.guild_id=guild for update;
    if monetization.token_grant_is_active(g.id) then
      update monetization.guild_token_grants set remaining=remaining+refund where id=g.id;
    elsif not g.reversed then
      update monetization.guild_token_grants set revoked_quantity=revoked_quantity+refund where id=g.id;
      update public.guilds set token_limit=token_limit-refund where id=guild;
    end if;
  end loop;
end $$;

create function monetization.refresh_guild_tokens(guild text) returns void
language plpgsql security definer set search_path='' as $$
declare g monetization.guild_token_grants; u monetization.token_usage; state monetization.guild_plan_state; active_plan boolean; expired integer:=0;
begin
  perform 1 from public.guilds where id=guild for update;
  if not found then raise exception 'Token recipient guild not found'; end if;
  for u in select * from monetization.token_usage p where p.guild_id=guild and p.status='reserved' and p.expires_at<=now() for update loop
    -- A lost process may have already generated paid audio. Keep its quoted
    -- charge; only an explicit provider failure can safely release a hold.
    update public.guilds set token_total_usage=token_total_usage+u.quantity where id=guild;
    update monetization.token_usage set status='settled',estimated=true where guild_id=guild and operation_id=u.operation_id;
  end loop;
  for g in select * from monetization.guild_token_grants p where p.guild_id=guild and p.remaining>0 order by p.id for update loop
    if not monetization.token_grant_is_active(g.id) then
      expired:=expired+g.remaining;
      update monetization.guild_token_grants set remaining=0,revoked_quantity=revoked_quantity+g.remaining where id=g.id;
    end if;
  end loop;
  if expired>0 then update public.guilds set token_limit=token_limit-expired where id=guild; end if;

  select * into state from monetization.guild_plan_state s where s.guild_id=guild for update;
  if found and state.managed_plan then
    select exists(select from monetization.purchase_deliveries f
      join monetization.discord_entitlements e on (e.application_id,e.id)=(f.application_id,f.entitlement_id)
      where f.target_type='guild' and f.target_id=guild and f.applied_state='granted' and f.desired_state='granted'
        and f.action_snapshot->>'grant_action'='grant_plan' and not e.deleted
        and (e.starts_at is null or e.starts_at<=now()) and (e.ends_at is null or e.ends_at>now())) into active_plan;
    if not active_plan and state.free_paused then
      update public.guilds set token_limit=token_limit+state.paused_free_tokens where id=guild;
      update monetization.guild_plan_state set paused_free_tokens=0,free_paused=false where guild_id=guild;
    end if;
    update public.guilds set has_active_subscription=active_plan where id=guild;
  end if;
  update public.guilds guild_row set token_balance=greatest(guild_row.token_limit::bigint-guild_row.token_total_usage-
    (select coalesce(sum(usage_row.quantity),0) from monetization.token_usage usage_row where usage_row.guild_id=guild and usage_row.status='reserved'),0)::integer where guild_row.id=guild;
end $$;

create function public.monetization_get_guild_token_state(guild text) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  if not exists(select from public.guilds where id=guild) then return null; end if;
  perform monetization.refresh_guild_tokens(guild);
  return monetization.guild_token_state(guild);
end $$;

create function monetization.allocate_guild_tokens(guild text,quantity integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare g monetization.guild_token_grants; left_to_use integer:=quantity; take integer; allocations jsonb:='[]';
begin
  for g in select * from monetization.guild_token_grants p where p.guild_id=guild and p.remaining>0
    order by p.expires_at nulls last,p.created_at,p.id for update loop
    exit when left_to_use=0;
    take:=least(left_to_use,g.remaining);
    update monetization.guild_token_grants set remaining=remaining-take where id=g.id;
    allocations:=allocations||jsonb_build_array(jsonb_build_object('grant_id',g.id,'quantity',take));
    left_to_use:=left_to_use-take;
  end loop;
  if left_to_use>0 then allocations:=allocations||jsonb_build_array(jsonb_build_object('grant_id',null,'quantity',left_to_use)); end if;
  return allocations;
end $$;

create function public.monetization_reserve_guild_tokens(guild text,operation text,quantity integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u monetization.token_usage; state jsonb; created boolean:=false;
begin
  if quantity is null or quantity<0 or operation is null or length(operation) not between 1 and 100 then raise exception 'Invalid token reservation'; end if;
  perform monetization.refresh_guild_tokens(guild);
  if exists(select from public.guilds where id=guild and is_banned) then raise exception 'Guild is banned'; end if;
  select * into u from monetization.token_usage p where p.guild_id=guild and p.operation_id=operation for update;
  if not found then
    state:=monetization.guild_token_state(guild);
    if (state->>'token_balance')::bigint<quantity then raise exception 'Insufficient token balance'; end if;
    insert into monetization.token_usage(guild_id,operation_id,status,quantity,allocations,expires_at)
      values(guild,operation,'reserved',quantity,monetization.allocate_guild_tokens(guild,quantity),now()+interval '15 minutes') returning * into u;
    created:=true;
  end if;
  perform monetization.refresh_guild_tokens(guild);
  return jsonb_build_object('created',created,'status',u.status,'quantity',u.quantity,'state',monetization.guild_token_state(guild));
end $$;

create function public.monetization_settle_guild_tokens(guild text,operation text,quantity integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u monetization.token_usage; extra integer;
begin
  if quantity is null or quantity<0 then raise exception 'Invalid token usage'; end if;
  -- Lock before looking at the operation, matching every other usage path.
  perform 1 from public.guilds where id=guild for update;
  if not found then raise exception 'Token recipient guild not found'; end if;
  perform monetization.refresh_guild_tokens(guild);
  select * into strict u from monetization.token_usage p where p.guild_id=guild and p.operation_id=operation for update;
  if u.status='settled' and not u.estimated then
    if u.quantity<>quantity then raise exception 'Settled token usage cannot change'; end if;
  elsif u.status='reserved' or (u.status='settled' and u.estimated) then
    perform monetization.refund_token_allocations(guild,u.allocations,quantity);
    extra:=greatest(quantity-u.quantity,0);
    -- Actual provider usage must still be recorded if a quote was too small.
    if extra>0 then perform monetization.allocate_guild_tokens(guild,extra); end if;
    update public.guilds set token_total_usage=token_total_usage+quantity-case when u.estimated then u.quantity else 0 end where id=guild;
    update monetization.token_usage set status='settled',estimated=false,quantity=monetization_settle_guild_tokens.quantity
      where guild_id=guild and operation_id=operation returning * into u;
  else
    raise exception 'Token reservation was released';
  end if;
  perform monetization.refresh_guild_tokens(guild);
  return jsonb_build_object('created',false,'status',u.status,'quantity',u.quantity,'state',monetization.guild_token_state(guild));
end $$;

create function public.monetization_release_guild_tokens(guild text,operation text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u monetization.token_usage;
begin
  perform 1 from public.guilds where id=guild for update;
  if not found then raise exception 'Token recipient guild not found'; end if;
  select * into strict u from monetization.token_usage p where p.guild_id=guild and p.operation_id=operation for update;
  if u.status='reserved' or (u.status='settled' and u.estimated) then
    perform monetization.refund_token_allocations(guild,u.allocations,0);
    if u.estimated then update public.guilds set token_total_usage=token_total_usage-u.quantity where id=guild; end if;
    update monetization.token_usage set status='released',estimated=false where guild_id=guild and operation_id=operation returning * into u;
  end if;
  perform monetization.refresh_guild_tokens(guild);
  return jsonb_build_object('created',false,'status',u.status,'quantity',u.quantity,'state',monetization.guild_token_state(guild));
end $$;

create or replace function monetization.assert_guild_fulfillment(app text,entitlement text) returns void
language plpgsql security definer set search_path='' as $$
declare e monetization.discord_entitlements; f monetization.purchase_deliveries;
begin
  perform monetization.assert_application(app);
  select * into strict e from monetization.discord_entitlements p where p.application_id=app and p.id=entitlement for update;
  select * into strict f from monetization.purchase_deliveries p where p.application_id=app and p.entitlement_id=entitlement for update;
  if f.target_type='guild' and f.target_id is not null and (f.target_id=e.guild_id or
    (e.guild_id is null and f.action_snapshot->>'grant_action'='grant_tokens' and exists(
      select from monetization.topup_redemptions r where r.application_id=app and r.entitlement_id=entitlement
        and r.guild_id=f.target_id and r.buyer_id=e.beneficiary_discord_id))) then return; end if;
  raise exception 'Fulfillment requires the entitlement guild or its redeemed top-up guild';
end $$;

create function public.monetization_redeem_topup(app text,entitlement text,buyer text,guild text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e monetization.discord_entitlements; f monetization.purchase_deliveries; a monetization.sku_features; redemption monetization.topup_redemptions;
begin
  perform monetization.assert_application(app);
  select * into strict e from monetization.discord_entitlements p where p.application_id=app and p.id=entitlement for update;
  if e.guild_id is not null or e.beneficiary_discord_id is distinct from buyer then raise exception 'Top-up does not belong to this buyer'; end if;
  if not exists(select from monetization.skus s where s.application_id=app and s.id=e.sku_id and s.type=3) then raise exception 'Only consumable top-ups can be redeemed'; end if;
  select * into redemption from monetization.topup_redemptions r where r.application_id=app and r.entitlement_id=entitlement;
  if found then
    if redemption.guild_id<>guild or redemption.buyer_id<>buyer then raise exception 'Top-up was already assigned to another guild'; end if;
    return public.monetization_get_purchase_fulfillment(app,entitlement);
  end if;
  if e.deleted or e.consumed or e.starts_at>now() or e.ends_at<=now() then raise exception 'Top-up is not eligible for redemption'; end if;
  select * into strict a from monetization.sku_features p where p.application_id=app and p.sku_id=e.sku_id for share;
  if not a.enabled or e.created_at<a.effective_from or a.mode<>'once' or a.grant_action<>'grant_tokens'
    or a.remove_action<>'remove_tokens' or a.grant_settings->'redeem_to_guild' is distinct from 'true'::jsonb then
    raise exception 'SKU is not configured for guild top-ups';
  end if;
  perform 1 from public.guilds g where g.id=guild and not g.is_banned for update;
  if not found then raise exception 'Guild is missing or banned'; end if;
  if exists(select from monetization.purchase_deliveries p where p.application_id=app and p.entitlement_id=entitlement) then
    raise exception 'Purchase already has another fulfillment';
  end if;
  insert into monetization.topup_redemptions(application_id,entitlement_id,buyer_id,guild_id) values(app,entitlement,buyer,guild);
  insert into monetization.purchase_deliveries(application_id,entitlement_id,sku_id,config_version,action_snapshot,target_type,target_id,processing_status)
    values(app,e.id,e.sku_id,a.version,jsonb_build_object('mode',a.mode,'grant_action',a.grant_action,
      'grant_settings',a.grant_settings,'remove_action',a.remove_action,'remove_settings',a.remove_settings),'guild',guild,'pending') returning * into f;
  return to_jsonb(f);
end $$;

create or replace function monetization.reconcile_fulfillment(app text,entitlement text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e monetization.discord_entitlements; f monetization.purchase_deliveries; removing boolean; recipient text; period timestamptz;
begin
  perform monetization.assert_application(app);
  select * into strict e from monetization.discord_entitlements p where p.application_id=app and p.id=entitlement for update;
  recipient:=e.guild_id;
  if recipient is null then
    select r.guild_id into recipient from monetization.topup_redemptions r where r.application_id=app and r.entitlement_id=entitlement;
    if recipient is null then return null; end if;
  else
    perform public.monetization_create_purchase_fulfillment(app,entitlement);
  end if;
  select * into f from monetization.purchase_deliveries p where p.application_id=app and p.entitlement_id=entitlement for update;
  if not found then return null; end if;
  if f.target_id is not null and (f.target_type<>'guild' or f.target_id<>recipient) then return null; end if;
  if f.target_id is null then
    update monetization.purchase_deliveries p set target_type='guild',target_id=recipient,processing_status='pending'
      where p.application_id=app and p.entitlement_id=entitlement returning * into f;
  end if;
  removing:=e.deleted or coalesce(e.ends_at<=now() and (f.action_snapshot->>'mode'='while_active' or f.applied_state='ungranted'),false)
    or (e.consumed and f.applied_state='ungranted');
  if removing and f.desired_state<>'removed' then
    update monetization.purchase_deliveries p set desired_state='removed',processing_status='pending',
      operation_id=gen_random_uuid(),last_error=null,next_attempt_at=null
      where p.application_id=app and p.entitlement_id=entitlement returning * into f;
  elsif not removing and f.desired_state='granted' and f.action_snapshot->>'grant_action'='grant_plan' and f.processing_status='succeeded' then
    select s.current_period_start into period from monetization.discord_purchases s
      where s.application_id=app and s.type='subscription' and s.id=e.subscription_id and not s.deleted
        and s.current_period_start<=now() and s.current_period_end>now();
    if period is not null and not exists(select from monetization.guild_token_grants g where g.application_id=app and g.entitlement_id=entitlement and g.period_start=period) then
      update monetization.purchase_deliveries p set processing_status='pending',operation_id=gen_random_uuid(),last_error=null,next_attempt_at=null
        where p.application_id=app and p.entitlement_id=entitlement returning * into f;
    end if;
  end if;
  return to_jsonb(f);
end $$;

create or replace function public.monetization_fulfillment_entitlements(app text,after_id text default null,page_size integer default 100) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  perform monetization.assert_application(app);
  if page_size is null or page_size not between 1 and 100 then raise exception 'Invalid page size'; end if;
  return (select coalesce(jsonb_agg(id order by id),'[]') from (
    select e.id from monetization.discord_entitlements e where e.application_id=app
      and (e.guild_id is not null or exists(select from monetization.topup_redemptions r where r.application_id=app and r.entitlement_id=e.id))
      and (after_id is null or e.id>after_id) order by e.id limit page_size
  ) page);
end $$;

create or replace function public.monetization_fulfillment_failure(app text,entitlement text,operation uuid,error_code text) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform monetization.assert_application(app);
  if error_code is null or error_code not in ('handler_failed','unsupported_action') then raise exception 'Invalid fulfillment error code'; end if;
  update monetization.purchase_deliveries p set processing_status='failed',last_error=error_code,
    attempt_count=p.attempt_count+1,next_attempt_at=now()+interval '1 hour'
    where p.application_id=app and p.entitlement_id=entitlement and p.operation_id=operation and p.target_type='guild'
      and (p.applied_state<>p.desired_state or (p.action_snapshot->>'grant_action'='grant_plan' and p.processing_status<>'succeeded'));
end $$;

create function monetization.apply_plan_action(app text,entitlement text,removing boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e monetization.discord_entitlements; f monetization.purchase_deliveries; subscription monetization.discord_purchases;
  g monetization.guild_token_grants; state monetization.guild_plan_state; settings jsonb; features jsonb; quantity integer;
  rollover integer; quantity_value numeric; rollover_value numeric; grant_id bigint; expire_at timestamptz; deduction integer; pause integer; expected text;
begin
  perform monetization.assert_application(app);
  select * into strict e from monetization.discord_entitlements p where p.application_id=app and p.id=entitlement for update;
  select * into strict f from monetization.purchase_deliveries p where p.application_id=app and p.entitlement_id=entitlement for update;
  expected:=case when removing then 'remove_plan' else 'grant_plan' end;
  if f.action_snapshot->>'grant_action' is distinct from 'grant_plan'
    or f.action_snapshot->>(case when removing then 'remove_action' else 'grant_action' end) is distinct from expected then raise exception 'Fulfillment action does not match plan handler'; end if;
  if f.target_type is distinct from 'guild' or f.target_id is distinct from e.guild_id or e.guild_id is null then raise exception 'Plan requires a guild entitlement'; end if;
  if not exists(select from monetization.skus s where s.application_id=app and s.id=e.sku_id and s.type=5 and (s.flags & 128)=128) then raise exception 'Plan requires a guild subscription SKU'; end if;
  select * into subscription from monetization.discord_purchases s where s.application_id=app and s.type='subscription' and s.id=e.subscription_id;
  if not removing then
    if f.action_snapshot->>'mode' is distinct from 'while_active' or f.action_snapshot->>'remove_action' is distinct from 'remove_plan' then raise exception 'Plan requires active access and a matching removal action'; end if;
    if f.desired_state='removed' or f.applied_state='removed' then raise exception 'Fulfillment has been removed'; end if;
    if e.deleted or e.consumed or e.starts_at>now() or e.ends_at<=now() then raise exception 'Entitlement is not eligible for granting'; end if;
    -- Entitlement and subscription events can arrive in either order. Wait for
    -- canonical billing dates; inventing a period would duplicate the first grant.
    if subscription.id is null or subscription.deleted or subscription.current_period_start>now() or subscription.current_period_end<=now() then return to_jsonb(f); end if;
    settings:=f.action_snapshot->'grant_settings';
    if jsonb_typeof(settings->'quantity') is distinct from 'number' or jsonb_typeof(settings->'rollover_months') is distinct from 'number' then raise exception 'Invalid plan allowance'; end if;
    quantity_value:=(settings->>'quantity')::numeric;
    rollover_value:=(settings->>'rollover_months')::numeric;
    if quantity_value<1 or quantity_value>2147483647 or trunc(quantity_value)<>quantity_value or rollover_value not in (0,1) then raise exception 'Invalid plan allowance'; end if;
    quantity:=quantity_value::integer; rollover:=rollover_value::integer;
    features:=settings->'features';
    if jsonb_typeof(features) is distinct from 'array' then raise exception 'Features must be an array'; end if;
    if jsonb_array_length(features)>64 or exists(select from jsonb_array_elements(features) x where jsonb_typeof(x)<>'string' or x#>>'{}' !~ '^[a-z][a-z0-9_]{0,63}$') then raise exception 'Invalid plan features'; end if;
  end if;
  perform monetization.refresh_guild_tokens(f.target_id);
  if removing then
    if f.applied_state='removed' then return to_jsonb(f); end if;
    for g in select * from monetization.guild_token_grants p where p.application_id=app and p.entitlement_id=entitlement order by p.id for update loop
      -- Discord does not identify historical refunded billing cycles. Reverse
      -- the current billing period if delivered; expire unused older allocations.
      if e.deleted and g.period_start=subscription.current_period_start then
        deduction:=g.quantity-g.revoked_quantity;
        update monetization.guild_token_grants set remaining=0,revoked_quantity=monetization.guild_token_grants.quantity,reversed=true where id=g.id;
      else
        deduction:=g.remaining;
        update monetization.guild_token_grants set remaining=0,revoked_quantity=revoked_quantity+g.remaining where id=g.id;
      end if;
      update public.guilds set token_limit=token_limit-deduction where id=f.target_id;
    end loop;
    update monetization.purchase_features p set removed_at=coalesce(p.removed_at,now()) where p.application_id=app and p.entitlement_id=entitlement;
    update monetization.purchase_deliveries p set desired_state='removed',applied_state='removed',processing_status='succeeded',removed_at=coalesce(p.removed_at,now()),
      attempt_count=p.attempt_count+1,last_error=null,next_attempt_at=null where p.application_id=app and p.entitlement_id=entitlement returning * into f;
  else
    insert into monetization.guild_plan_state(guild_id) values(f.target_id) on conflict do nothing;
    select * into strict state from monetization.guild_plan_state s where s.guild_id=f.target_id for update;
    if not state.free_paused then
      select least(5000,greatest(guild_row.token_limit::bigint-guild_row.token_total_usage
        -(select coalesce(sum(t.remaining),0) from monetization.guild_token_grants t where t.guild_id=f.target_id)
        -(select coalesce(sum(u.quantity),0) from monetization.token_usage u where u.guild_id=f.target_id and u.status='reserved'),0))::integer
        into pause from public.guilds guild_row where guild_row.id=f.target_id;
      update public.guilds set token_limit=token_limit-pause where id=f.target_id;
      update monetization.guild_plan_state set free_paused=true,paused_free_tokens=pause where guild_id=f.target_id;
    end if;
    update monetization.guild_plan_state set managed_plan=true,legacy_features=false where guild_id=f.target_id;
    expire_at:=subscription.current_period_end;
    if rollover=1 then expire_at:=((expire_at at time zone 'UTC')+interval '1 month') at time zone 'UTC'; end if;
    insert into monetization.guild_token_grants(application_id,entitlement_id,guild_id,kind,period_start,period_end,expires_at,quantity,remaining)
      values(app,entitlement,f.target_id,'plan',subscription.current_period_start,subscription.current_period_end,expire_at,quantity,quantity)
      on conflict(application_id,entitlement_id,period_start) do nothing returning id into grant_id;
    if grant_id is not null then update public.guilds set token_limit=token_limit+quantity where id=f.target_id; end if;
    insert into monetization.purchase_features(application_id,entitlement_id,feature,target_type,target_id)
      select app,entitlement,value,'guild',f.target_id from jsonb_array_elements_text(features)
      on conflict(application_id,entitlement_id,feature) do nothing;
    update monetization.purchase_deliveries p set applied_state='granted',processing_status='succeeded',granted_at=coalesce(p.granted_at,now()),
      grant_result=jsonb_build_object('quantity',quantity,'features',features,'period_start',subscription.current_period_start,'period_end',subscription.current_period_end),
      attempt_count=p.attempt_count+case when grant_id is null then 0 else 1 end,last_error=null,next_attempt_at=null
      where p.application_id=app and p.entitlement_id=entitlement returning * into f;
  end if;
  perform monetization.refresh_guild_tokens(f.target_id);
  return to_jsonb(f);
end $$;

create function public.monetization_grant_plan(app text,entitlement text) returns jsonb
language sql security definer set search_path='' as $$ select monetization.apply_plan_action(app,entitlement,false); $$;
create function public.monetization_remove_plan(app text,entitlement text) returns jsonb
language sql security definer set search_path='' as $$ select monetization.apply_plan_action(app,entitlement,true); $$;

create or replace function monetization.apply_token_action(app text,entitlement text,removing boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e monetization.discord_entitlements; f monetization.purchase_deliveries; g monetization.guild_token_grants;
  quantity_value numeric; quantity integer; deduction integer; expected text;
begin
  perform monetization.assert_application(app);
  select * into strict e from monetization.discord_entitlements p where p.application_id=app and p.id=entitlement for update;
  select * into strict f from monetization.purchase_deliveries p where p.application_id=app and p.entitlement_id=entitlement for update;
  expected:=case when removing then 'remove_tokens' else 'grant_tokens' end;
  if f.action_snapshot->>'grant_action' is distinct from 'grant_tokens'
    or f.action_snapshot->>(case when removing then 'remove_action' else 'grant_action' end) is distinct from expected then raise exception 'Fulfillment action does not match token handler'; end if;
  select * into g from monetization.guild_token_grants p where p.application_id=app and p.entitlement_id=entitlement and p.kind='topup';
  if removing and g.id is null then
    -- Pre-migration grants have no allocation history. Preserve their original
    -- reversal contract instead of guessing which of their tokens were spent.
    return monetization.apply_token_action_before_guild_only(app,entitlement,true);
  end if;
  if removing and f.applied_state='removed' then return to_jsonb(f); end if;
  if not removing then
    if f.desired_state='removed' or f.applied_state='removed' then raise exception 'Fulfillment has been removed'; end if;
    if f.applied_state='granted' then return to_jsonb(f); end if;
    perform monetization.assert_guild_fulfillment(app,entitlement);
    if e.deleted or e.consumed or e.starts_at>now() or e.ends_at<=now() then raise exception 'Entitlement is not eligible for granting'; end if;
    if jsonb_typeof(f.action_snapshot->'grant_settings'->'quantity') is distinct from 'number' then raise exception 'Invalid token quantity'; end if;
    quantity_value:=(f.action_snapshot->'grant_settings'->>'quantity')::numeric;
    if quantity_value<1 or quantity_value>2147483647 or trunc(quantity_value)<>quantity_value then raise exception 'Invalid token quantity'; end if;
    quantity:=quantity_value::integer;
  end if;
  perform monetization.refresh_guild_tokens(f.target_id);
  if removing then
    select * into strict g from monetization.guild_token_grants p where p.id=g.id for update;
    deduction:=g.quantity-g.revoked_quantity;
    update public.guilds set token_limit=token_limit-deduction where id=f.target_id;
    update monetization.guild_token_grants set remaining=0,revoked_quantity=monetization.guild_token_grants.quantity,reversed=true where id=g.id;
    update monetization.purchase_deliveries p set desired_state='removed',applied_state='removed',processing_status='succeeded',removed_at=now(),
      attempt_count=p.attempt_count+1,last_error=null,next_attempt_at=null where p.application_id=app and p.entitlement_id=entitlement returning * into f;
  else
    insert into monetization.guild_token_grants(application_id,entitlement_id,guild_id,kind,period_start,quantity,remaining)
      values(app,entitlement,f.target_id,'topup',e.created_at,quantity,quantity);
    update public.guilds set token_limit=token_limit+quantity where id=f.target_id;
    update monetization.purchase_deliveries p set applied_state='granted',processing_status='succeeded',granted_at=now(),grant_result=jsonb_build_object('quantity',quantity),
      attempt_count=p.attempt_count+1,last_error=null,next_attempt_at=null where p.application_id=app and p.entitlement_id=entitlement returning * into f;
  end if;
  perform monetization.refresh_guild_tokens(f.target_id);
  return to_jsonb(f);
end $$;

create function public.monetization_get_subscription_entitlements(app text,subscription text) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  perform monetization.assert_application(app);
  return (select coalesce(jsonb_agg(e.id order by e.id),'[]') from monetization.discord_entitlements e
    where e.application_id=app and e.subscription_id=subscription and e.guild_id is not null);
end $$;

create function public.monetization_pending_consumptions(app text,after_id text default null,page_size integer default 100) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  perform monetization.assert_application(app);
  if page_size is null or page_size not between 1 and 100 then raise exception 'Invalid page size'; end if;
  return (select coalesce(jsonb_agg(id order by id),'[]') from (
    select e.id from monetization.discord_entitlements e
    join monetization.purchase_deliveries f on (f.application_id,f.entitlement_id)=(e.application_id,e.id)
    join monetization.skus s on (s.application_id,s.id)=(e.application_id,e.sku_id)
    where e.application_id=app and not e.consumed and not e.deleted and s.type=3
      and f.action_snapshot->>'grant_action'='grant_tokens' and f.applied_state='granted' and f.desired_state='granted'
      and (after_id is null or e.id>after_id) order by e.id limit page_size
  ) page);
end $$;

create function public.monetization_record_consumed_purchase(app text,entitlement text) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform monetization.assert_application(app);
  perform 1 from monetization.discord_entitlements e where e.application_id=app and e.id=entitlement for update;
  if not exists(select from monetization.purchase_deliveries f join monetization.discord_entitlements e
    on (e.application_id,e.id)=(f.application_id,f.entitlement_id) join monetization.skus s on (s.application_id,s.id)=(e.application_id,e.sku_id)
    where f.application_id=app and f.entitlement_id=entitlement and f.applied_state='granted' and f.desired_state='granted'
      and f.action_snapshot->>'grant_action'='grant_tokens' and s.type=3 and not e.deleted) then raise exception 'Consumable has not been delivered'; end if;
  update monetization.discord_entitlements set consumed=true where application_id=app and id=entitlement;
  update monetization.discord_purchases set consumed=true where application_id=app and type='one_time' and entitlement_id=entitlement;
end $$;

create function public.monetization_get_sku(app text,sku text) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
  perform monetization.assert_application(app);
  return (select to_jsonb(s) from monetization.skus s where s.application_id=app and s.id=sku);
end $$;

-- Deny implicit/default grants as well as direct access to internal helpers.
revoke all on function monetization.token_grant_is_active(bigint),monetization.guild_token_state(text),
  monetization.refund_token_allocations(text,jsonb,integer),monetization.refresh_guild_tokens(text),
  monetization.allocate_guild_tokens(text,integer),monetization.apply_plan_action(text,text,boolean)
  from public,anon,authenticated,service_role;
revoke all on function public.monetization_get_guild_token_state(text),public.monetization_reserve_guild_tokens(text,text,integer),
  public.monetization_settle_guild_tokens(text,text,integer),public.monetization_release_guild_tokens(text,text),
  public.monetization_redeem_topup(text,text,text,text),public.monetization_grant_plan(text,text),public.monetization_remove_plan(text,text),
  public.monetization_get_subscription_entitlements(text,text),public.monetization_pending_consumptions(text,text,integer),
  public.monetization_record_consumed_purchase(text,text),public.monetization_get_sku(text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.monetization_get_guild_token_state(text),public.monetization_reserve_guild_tokens(text,text,integer),
  public.monetization_settle_guild_tokens(text,text,integer),public.monetization_release_guild_tokens(text,text),
  public.monetization_redeem_topup(text,text,text,text),public.monetization_grant_plan(text,text),public.monetization_remove_plan(text,text),
  public.monetization_get_subscription_entitlements(text,text),public.monetization_pending_consumptions(text,text,integer),
  public.monetization_record_consumed_purchase(text,text),public.monetization_get_sku(text,text) to service_role;
notify pgrst, 'reload schema';
commit;
