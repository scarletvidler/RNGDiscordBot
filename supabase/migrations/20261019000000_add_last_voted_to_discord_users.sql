alter table public.discord_users
add column if not exists last_voted timestamptz;
