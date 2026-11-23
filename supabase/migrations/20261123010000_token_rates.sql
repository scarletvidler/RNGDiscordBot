-- Conversion rates are editable independently of the bot deployment.
begin;

create table monetization.token_rates (
  provider text not null,
  model text not null,
  unit text not null check (unit in ('provider_credits', 'utf8_bytes')),
  tokens_numerator integer not null check (tokens_numerator > 0),
  tokens_denominator integer not null check (tokens_denominator > 0),
  estimate_units_per_character numeric not null default 1
    check (estimate_units_per_character > 0 and estimate_units_per_character <= 100),
  primary key (provider, model)
);

-- ElevenLabs uses the billed character-cost response header. Its Flash discount
-- is already reflected there: do not apply a second discount to that value.
-- The approved Lerche reference is 10,000 tokens per USD 1.82.
-- Fish S2.1 Pro is USD 15 per million UTF-8 bytes, giving 15 / 182 tokens per byte.
-- Sources: https://elevenlabs.io/docs/api-reference/introduction
--          https://fish.audio/app/developers/
insert into monetization.token_rates
  (provider, model, unit, tokens_numerator, tokens_denominator, estimate_units_per_character)
values
  ('elevenlabs', 'eleven_v3', 'provider_credits', 1, 1, 1),
  ('elevenlabs', 'eleven_flash_v2_5', 'provider_credits', 1, 1, 1),
  ('fish', 's2.1-pro', 'utf8_bytes', 15, 182, 1);

alter table monetization.token_rates enable row level security;
revoke all on monetization.token_rates from public, anon, authenticated, service_role;

create function public.monetization_get_token_rate(provider_name text, model_name text)
returns jsonb language sql security definer set search_path = '' as $$
  select to_jsonb(r) from monetization.token_rates r
  where r.provider = provider_name and r.model = model_name;
$$;

revoke all on function public.monetization_get_token_rate(text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.monetization_get_token_rate(text, text) to service_role;

notify pgrst, 'reload schema';
commit;
