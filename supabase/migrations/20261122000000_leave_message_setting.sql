alter table public.guild_tts_settings
  add column leave_message_enabled boolean not null default true;
