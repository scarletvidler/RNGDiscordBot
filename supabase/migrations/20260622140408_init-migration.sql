-- users: Discord user accounts
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  discord_id text not null,
  username text,
  constraint users_discord_id_key unique (discord_id)
);

-- servers: Discord guilds
create table if not exists public.servers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  discord_server_id text not null,
  server_name text,
  constraint servers_discord_server_id_key unique (discord_server_id)
);

-- profiles: one row per user+server pair, tracks rolling cooldown
create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references public.users (id) on delete cascade,
  server_id uuid not null references public.servers (id) on delete cascade,
  last_rolled_at timestamptz,
  constraint profiles_user_id_server_id_key unique (user_id, server_id)
);

-- pokemon: Pokédex data seeded from the PokéAPI
create table if not exists public.pokemon (
  id integer primary key,
  created_at timestamptz not null default now(),
  name text not null,
  pokedex_id integer not null,
  sprites jsonb,
  capture_rate integer,
  height integer,
  weight integer,
  flavor_text text,
  has_gender_differences boolean not null default false,
  legendary boolean not null default false,
  mythical boolean not null default false
);

-- user_pokemon: Pokémon caught by a profile, supports shiny variants
create table if not exists public.user_pokemon (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  pokemon_id integer not null references public.pokemon (id) on delete cascade,
  shiny boolean not null default false
);
