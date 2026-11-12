-- Use the bot's existing Supabase service credential through server-only public RPCs.
-- Records stay in the private monetization schema; no Data API schema exposure is needed.
create or replace function monetization.assert_application(app text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if current_setting('role', true) is distinct from 'service_role' then
    raise exception 'Monetization access denied' using errcode = '42501';
  end if;
  if app is null or app !~ '^[0-9]{1,20}$' then
    raise exception 'Invalid application ID';
  end if;
end $$;

create function public.monetization_upsert_skus(records jsonb)
returns void language sql security definer set search_path='' as $$
  select monetization.upsert_skus(records);
$$;
create function public.monetization_apply_subscription(r jsonb)
returns void language sql security definer set search_path='' as $$
  select monetization.apply_subscription(r);
$$;
create function public.monetization_apply_entitlement(r jsonb)
returns void language sql security definer set search_path='' as $$
  select monetization.apply_entitlement(r);
$$;
create function public.monetization_known_purchasers(app text, after_id text default null, page_size integer default 100)
returns jsonb language sql security definer set search_path='' as $$
  select monetization.known_purchasers(app, after_id, page_size);
$$;
create function public.monetization_read_records(kind text, app text, usr text default null, guild text default null, after_id text default null, page_size integer default 100)
returns jsonb language sql security definer set search_path='' as $$
  select monetization.read_records(kind, app, usr, guild, after_id, page_size);
$$;

-- Supabase projects may grant function execution by default. Explicitly restrict every wrapper.
revoke all on function public.monetization_upsert_skus(jsonb), public.monetization_apply_subscription(jsonb), public.monetization_apply_entitlement(jsonb), public.monetization_known_purchasers(text,text,integer), public.monetization_read_records(text,text,text,text,text,integer) from public, anon, authenticated, service_role;
grant execute on function public.monetization_upsert_skus(jsonb), public.monetization_apply_subscription(jsonb), public.monetization_apply_entitlement(jsonb), public.monetization_known_purchasers(text,text,integer), public.monetization_read_records(text,text,text,text,text,integer) to service_role;

-- Retire the separate login/binding path without changing any lifecycle records.
revoke all on all functions in schema monetization from monetization_writer, monetization_reader;
revoke all on all tables in schema monetization from monetization_writer, monetization_reader;
revoke all on schema monetization from monetization_writer, monetization_reader;
drop table monetization.login_applications;
drop role monetization_writer;
drop role monetization_reader;
notify pgrst, 'reload schema';
