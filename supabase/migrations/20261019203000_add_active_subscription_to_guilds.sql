alter table public.guilds
add column if not exists has_active_subscription boolean not null default false;
