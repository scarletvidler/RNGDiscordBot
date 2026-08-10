alter table public.guild_voices
  drop constraint guild_voices_pkey;

alter table public.guild_voices
  add constraint guild_voices_pkey
  primary key (guild_id, owner_type, owner_id);
