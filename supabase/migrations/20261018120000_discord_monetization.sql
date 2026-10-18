create table if not exists public.discord_skus (
  sku_id text primary key,
  name text not null,
  tokens_per_period integer not null check (tokens_per_period > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.discord_entitlements (
  id text primary key,
  guild_id text not null references public.guilds(id) on delete cascade,
  user_id text,
  sku_id text not null references public.discord_skus(sku_id),
  deleted boolean not null default false,
  consumed boolean not null default false,
  starts_at timestamptz,
  ends_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.discord_subscriptions (
  id text primary key,
  guild_id text not null references public.guilds(id) on delete cascade,
  purchaser_user_id text not null,
  sku_id text not null references public.discord_skus(sku_id),
  entitlement_id text,
  status integer not null,
  current_period_start timestamptz not null,
  current_period_end timestamptz not null,
  canceled_at timestamptz,
  renewal_sku_ids jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.token_grants (
  id uuid primary key default gen_random_uuid(),
  guild_id text not null references public.guilds(id) on delete cascade,
  source text not null check (
    source in ('discord_subscription', 'discord_test_entitlement', 'discord_consumable', 'manual')
  ),
  source_key text not null unique,
  amount integer not null check (amount > 0),
  discord_subscription_id text,
  discord_entitlement_id text,
  sku_id text references public.discord_skus(sku_id),
  billing_period_start timestamptz,
  billing_period_end timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists discord_entitlements_guild_idx
  on public.discord_entitlements (guild_id);

create index if not exists discord_subscriptions_guild_idx
  on public.discord_subscriptions (guild_id, current_period_end desc);

create index if not exists token_grants_guild_created_idx
  on public.token_grants (guild_id, created_at desc);

create trigger discord_skus_set_updated_at
  before update on public.discord_skus
  for each row execute function public.set_updated_at();

create trigger discord_entitlements_set_updated_at
  before update on public.discord_entitlements
  for each row execute function public.set_updated_at();

create trigger discord_subscriptions_set_updated_at
  before update on public.discord_subscriptions
  for each row execute function public.set_updated_at();

alter table public.discord_skus enable row level security;
alter table public.discord_entitlements enable row level security;
alter table public.discord_subscriptions enable row level security;
alter table public.token_grants enable row level security;

create or replace function public.grant_discord_tokens(
  p_guild_id text,
  p_source text,
  p_source_key text,
  p_amount integer,
  p_subscription_id text default null,
  p_entitlement_id text default null,
  p_sku_id text default null,
  p_period_start timestamptz default null,
  p_period_end timestamptz default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_grant_id uuid;
begin
  if p_amount <= 0 then
    raise exception 'Token grant amount must be greater than zero';
  end if;

  insert into public.token_grants (
    guild_id,
    source,
    source_key,
    amount,
    discord_subscription_id,
    discord_entitlement_id,
    sku_id,
    billing_period_start,
    billing_period_end
  ) values (
    p_guild_id,
    p_source,
    p_source_key,
    p_amount,
    p_subscription_id,
    p_entitlement_id,
    p_sku_id,
    p_period_start,
    p_period_end
  )
  on conflict (source_key) do nothing
  returning id into inserted_grant_id;

  if inserted_grant_id is null then
    return false;
  end if;

  update public.guilds
  set
    token_limit = token_limit + p_amount,
    token_balance = greatest(token_limit + p_amount - token_total_usage, 0)
  where id = p_guild_id;

  if not found then
    raise exception 'Guild % does not exist', p_guild_id;
  end if;

  return true;
end;
$$;

revoke all on function public.grant_discord_tokens(
  text, text, text, integer, text, text, text, timestamptz, timestamptz
) from public, anon, authenticated;

grant execute on function public.grant_discord_tokens(
  text, text, text, integer, text, text, text, timestamptz, timestamptz
) to service_role;
