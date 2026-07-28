alter table public.guild_tts_settings
add column if not exists tts_say_users_name boolean not null default false;