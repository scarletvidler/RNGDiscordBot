alter table public.guild_tts_settings
  add column if not exists listen_role_id text,
  add column if not exists tts_channel_id text,
  add column if not exists default_voice_id text,
  add column if not exists setup_completed_at timestamptz;

update public.guild_tts_settings
set
  default_voice_id = coalesce(
    default_voice_id,
    case
      when tts_provider like 'Fish:%' then
        coalesce(fisher_female_voice_id, '9a9cf47702da476aa4629e2506d4a857')
      else
        coalesce(elevenlabs_female_voice_id, 'cgSgspJ2msm6clMCkdW9')
    end
  ),
  setup_completed_at = coalesce(setup_completed_at, now());

alter table public.guild_tts_settings
  alter column default_voice_id set default 'cgSgspJ2msm6clMCkdW9',
  alter column default_voice_id set not null;

alter table public.guild_tts_settings
  rename column tts_provider to tts_model;

alter table public.guild_tts_settings
  drop column if exists elevenlabs_female_voice_id,
  drop column if exists elevenlabs_male_voice_id,
  drop column if exists fisher_female_voice_id,
  drop column if exists fisher_male_voice_id;

comment on column public.guild_tts_settings.listen_role_id is
  'Discord role allowed to use TTS. The guild ID represents @everyone; null preserves the legacy Lerche Listens name lookup.';

comment on column public.guild_tts_settings.tts_channel_name is
  'Legacy fallback for guilds configured before channel IDs were stored.';
