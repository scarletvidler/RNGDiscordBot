alter table public.guild_tts_settings
add column if not exists tts_ping_sound_enabled boolean not null default true;
