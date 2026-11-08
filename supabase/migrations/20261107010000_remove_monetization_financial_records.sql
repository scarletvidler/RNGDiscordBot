-- Supersedes the financial portion of the original records migration without rewriting history.
-- Applying this migration removes any financial rows; subscription/entitlement records remain.
drop function monetization.record_verified_payment(jsonb);
drop function monetization.known_subscriptions(text,text,integer);
drop table monetization.payment_items;
drop table monetization.payments;
alter table monetization.subscriptions drop column amount_minor, drop column currency, drop column latest_payment_at;
alter table monetization.one_time_purchases drop column amount_minor, drop column currency, drop column latest_payment_at;

create or replace function monetization.read_records(kind text, app text, user_id text default null, guild text default null, after_id text default null, page_size integer default 100)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  perform monetization.assert_application(app);
  if page_size is null or page_size not between 1 and 100 then raise exception 'Invalid page size'; end if;
  if kind='subscriptions' then
    select coalesce(jsonb_agg(to_jsonb(x)||jsonb_build_object('items',(select coalesce(jsonb_agg(jsonb_build_object('sku_id',i.sku_id,'title',i.title,'is_current',i.is_current) order by i.sku_id),'[]') from monetization.subscription_items i where i.application_id=app and i.subscription_id=x.id))),'[]') into result from (
      select s.* from monetization.subscriptions s where s.application_id=app and (user_id is null or s.purchaser_discord_id=user_id)
        and (guild is null or exists(select from monetization.entitlements e where e.application_id=app and e.subscription_id=s.id and e.guild_id=guild))
        and (after_id is null or s.id>after_id) order by s.id limit page_size) x;
  elsif kind='one_time_purchases' then
    select coalesce(jsonb_agg(to_jsonb(x)),'[]') into result from (
      select p.* from monetization.one_time_purchases p where p.application_id=app and (user_id is null or p.purchaser_discord_id=user_id)
        and (guild is null or p.guild_id=guild) and (after_id is null or p.id>after_id) order by p.id limit page_size) x;
  else raise exception 'Invalid record type'; end if;
  return result;
end $$;

-- The former finance group is no longer a supported access path. Remove its grants and role.
revoke all on all functions in schema monetization from monetization_finance;
revoke all on all tables in schema monetization from monetization_finance;
revoke all on schema monetization from monetization_finance;
drop role monetization_finance;
