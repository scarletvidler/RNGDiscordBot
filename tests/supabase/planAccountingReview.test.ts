import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("extra provider usage cannot spend a plan that expired during generation", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table public.discord_users(id text primary key,username text not null);
    create table public.guilds(id text primary key,token_limit integer not null default 5000,
      token_total_usage integer not null default 0,token_balance integer not null default 5000,
      has_active_subscription boolean not null default false,is_banned boolean not null default false);
    alter default privileges grant execute on functions to anon,authenticated,service_role;
  `);
  for (const file of [
    "20261107000000_discord_monetization_records.sql",
    "20261107010000_remove_monetization_financial_records.sql",
    "20261112000000_shared_supabase_monetization.sql",
    "20261112010000_sku_fulfillment_state.sql",
    "20261114000000_fulfillment_actions.sql",
    "20261115000000_token_fulfillment_actions.sql",
    "20261115010000_guild_fulfillment_dispatch.sql",
    "20261122010000_unify_monetization_purchases.sql",
    "20261123000000_plan_allowances.sql",
  ]) {
    await db.exec(
      await readFile(
        new URL(`../../supabase/migrations/${file}`, import.meta.url),
        "utf8",
      ),
    );
  }
  await db.exec(`
    insert into public.guilds(id,token_limit,token_balance) values('400',200,200);
    insert into monetization.skus(application_id,id,name,type,flags,observed_at)
      values('100','200','Plan',5,128,now()),('100','201','Top-up',3,4,now());
    insert into monetization.discord_entitlements(application_id,id,sku_id,guild_id,type,
      consumed,deleted,created_at,observed_at)
      values('100','300','200','400',1,false,false,now(),now()),
        ('100','301','201','400',1,false,false,now(),now());
    insert into monetization.purchase_deliveries(application_id,entitlement_id,sku_id,
      config_version,action_snapshot,target_type,target_id,desired_state,applied_state,processing_status)
      values('100','300','200',1,'{}','guild','400','granted','granted','succeeded'),
        ('100','301','201',1,'{}','guild','400','granted','granted','succeeded');
    insert into monetization.guild_token_grants(application_id,entitlement_id,guild_id,kind,
      period_start,period_end,expires_at,quantity,remaining)
      values('100','300','400','plan',now()-interval '30 days',now()+interval '1 day',
        now()+interval '1 day',100,100),
        ('100','301','400','topup',now(),null,null,100,100);
    set role service_role;
    select public.monetization_reserve_guild_tokens('400','message',20);
    reset role;
  `);

  // Generation started with a valid plan reservation. Its additional cost must
  // come from tokens still available when the provider returns its actual usage.
  await db.exec(`
    update monetization.guild_token_grants set period_end=now()-interval '1 second',
      expires_at=now()-interval '1 second' where entitlement_id='300';
    set role service_role;
  `);
  const result = await db.query<{
    result: { state: { token_balance: number; token_total_usage: number } };
  }>(
    "select public.monetization_settle_guild_tokens('400','message',40) as result",
  );
  assert.equal(result.rows[0]?.result.state.token_balance, 80);
  assert.equal(result.rows[0]?.result.state.token_total_usage, 40);
  await db.exec("reset role");
  const grants = await db.query<{
    kind: string;
    remaining: number;
    revoked_quantity: number;
  }>(
    "select kind,remaining,revoked_quantity from monetization.guild_token_grants order by kind",
  );
  assert.deepEqual(grants.rows, [
    { kind: "plan", remaining: 0, revoked_quantity: 80 },
    { kind: "topup", remaining: 80, revoked_quantity: 0 },
  ]);
});
