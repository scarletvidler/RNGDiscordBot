-- Restore the relationships removed by 20260727125609. Explicit guild deletion
-- now removes its logs and settings, matching /lerche-uninstall.
-- Validate existing rows: orphaned guild IDs must be resolved before applying
-- this migration. Do not silently delete history or fabricate parent guilds.
begin;

alter table public.guild_chat_logs
  add constraint guild_chat_logs_guild_id_fkey
  foreign key (guild_id) references public.guilds(id) on delete cascade;

alter table public.guild_tts_settings
  add constraint guild_tts_settings_guild_id_fkey
  foreign key (guild_id) references public.guilds(id) on delete cascade;

commit;
