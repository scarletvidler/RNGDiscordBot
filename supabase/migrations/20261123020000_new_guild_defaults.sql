-- Apply starter defaults to new rows only; preserve existing balances and voices.
begin;

alter table public.guilds
  alter column token_limit set default 1000;

alter table public.guild_tts_settings
  alter column tts_model set default 'eleven_flash_v2_5';

commit;
