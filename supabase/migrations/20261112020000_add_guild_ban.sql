alter table public.guilds
  add column is_banned boolean not null default false;

comment on column public.guilds.is_banned is
  'When true, blocks this guild from using Lerche. Managed by database administrators.';
