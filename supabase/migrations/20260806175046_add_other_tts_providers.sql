alter table public.guild_tts_settings
  add column if not exists tts_provider text not null default 'elevenlabs',
  add column if not exists tts_provider_api_key text,
  add column if not exists fisher_female_voice_id text,
  add column if not exists fisher_male_voice_id text;

alter table public.guild_tts_settings
  rename column female_voice_id to elevenlabs_female_voice_id;

alter table public.guild_tts_settings
  rename column male_voice_id to elevenlabs_male_voice_id;

create type public.voice_owner_type as enum ('user', 'role');

create table if not exists public.guild_voices (
  guild_id text not null,
  voice_id text not null,
  voice_name text not null,
  voice_provider text not null default 'elevenlabs',
  owner_type public.voice_owner_type not null default 'user',
  owner_id text not null,
  created_at timestamptz not null default now(),

  primary key (guild_id, voice_id, owner_type, owner_id),

  foreign key (guild_id)
    references public.guilds(id)
    on delete cascade
    on update cascade
);