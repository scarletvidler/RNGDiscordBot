alter table public.guild_members
  add column if not exists last_rolled_at timestamptz;
