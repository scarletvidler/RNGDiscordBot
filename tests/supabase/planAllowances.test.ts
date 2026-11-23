import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("monthly plans, rollover and guild top-ups preserve token accounting", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table public.discord_users(id text primary key,username text not null);
    create table public.guilds(id text primary key,token_limit integer not null default 5000,
      token_total_usage integer not null default 0,token_balance integer not null default 5000,
      has_active_subscription boolean not null default false,is_banned boolean not null default false);
    insert into public.guilds(id) values('400');
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
  async function rpc(name: string, args: unknown[]) {
    await db.exec("set role service_role");
    return (
      await db.query<{ result: any }>(
        `select public.${name}(${args.map((_, i) => `$${i + 1}`).join(",")}) as result`,
        args.map((value) =>
          value !== null && typeof value === "object"
            ? JSON.stringify(value)
            : value,
        ),
      )
    ).rows[0]?.result;
  }
  async function sql(query: string, args: unknown[] = []) {
    await db.exec("reset role");
    return (await db.query<any>(query, args)).rows;
  }
  let sequence = 1000;
  let observed = Date.now();
  const app = "100";
  const state = (guild: string) =>
    rpc("monetization_get_guild_token_state", [guild]);
  const reserve = (guild: string, id: string, quantity: number) =>
    rpc("monetization_reserve_guild_tokens", [guild, id, quantity]);
  const settle = (guild: string, id: string, quantity: number) =>
    rpc("monetization_settle_guild_tokens", [guild, id, quantity]);
  const release = (guild: string, id: string) =>
    rpc("monetization_release_guild_tokens", [guild, id]);
  async function fixture({
    rollover = 0,
    topup = false,
    existingGuild,
  }: { rollover?: number; topup?: boolean; existingGuild?: string } = {}) {
    const guild = existingGuild ?? String(++sequence);
    const sku = String(++sequence);
    const entitlement = String(++sequence);
    const subscription = String(++sequence);
    const buyer = String(++sequence);
    if (!existingGuild)
      await sql("insert into public.guilds(id) values($1)", [guild]);
    await rpc("monetization_upsert_skus", [
      [
        {
          applicationId: app,
          id: sku,
          name: "Test",
          type: topup ? 3 : 5,
          flags: topup ? 4 : 128,
          observedAt: new Date(++observed).toISOString(),
        },
      ],
    ]);
    await rpc("monetization_upsert_sku_action", [
      {
        application_id: app,
        sku_id: sku,
        enabled: true,
        mode: topup ? "once" : "while_active",
        grant_action: topup ? "grant_tokens" : "grant_plan",
        grant_settings: topup
          ? { quantity: 1000, redeem_to_guild: true }
          : {
              quantity: 15000,
              rollover_months: rollover,
              features: ["emotion_tags"],
            },
        remove_action: topup ? "remove_tokens" : "remove_plan",
        remove_settings: {},
        effective_from: "2020-01-01T00:00:00Z",
      },
    ]);
    const dates = (
      await sql(
        "select now()-interval '20 days' as start,now()+interval '10 days' as finish",
      )
    )[0];
    if (!topup)
      await rpc("monetization_apply_subscription", [
        {
          applicationId: app,
          id: subscription,
          userId: buyer,
          skuIds: [sku],
          entitlementIds: [entitlement],
          renewalSkuIds: null,
          status: 0,
          currentPeriodStart: dates.start,
          currentPeriodEnd: dates.finish,
          canceledAt: null,
          createdAt: "2026-01-01T00:00:00Z",
          observedAt: new Date(++observed).toISOString(),
          deleted: false,
        },
      ]);
    await rpc("monetization_apply_entitlement", [
      {
        applicationId: app,
        id: entitlement,
        skuId: sku,
        userId: buyer,
        guildId: topup ? null : guild,
        type: 1,
        startsAt: null,
        endsAt: null,
        consumed: false,
        deleted: false,
        createdAt: "2026-01-01T00:00:00Z",
        observedAt: new Date(++observed).toISOString(),
      },
    ]);
    const grant = () =>
      rpc(topup ? "monetization_grant_tokens" : "monetization_grant_plan", [
        app,
        entitlement,
      ]);
    const remove = () =>
      rpc(topup ? "monetization_remove_tokens" : "monetization_remove_plan", [
        app,
        entitlement,
      ]);
    const redeem = (who = buyer, into = guild) =>
      rpc("monetization_redeem_topup", [app, entitlement, who, into]);
    return {
      guild,
      sku,
      entitlement,
      subscription,
      buyer,
      dates,
      grant,
      remove,
      redeem,
    };
  }

  await t.test(
    "deployment preserves existing balances and existing feature access",
    async () => {
      const original = await state("400");
      assert.equal(original.token_balance, 5000);
      assert.equal(original.legacy_features, true);
      assert.equal(original.managed_plan, false);
      await sql("insert into public.guilds(id) values('401')");
      assert.equal((await state("401")).legacy_features, false);
    },
  );

  await t.test(
    "a plan grants the total allowance and features once",
    async () => {
      const f = await fixture({ existingGuild: "400" });
      await f.grant();
      await f.grant();
      assert.equal((await state(f.guild)).token_balance, 15000);
      assert.equal((await state(f.guild)).legacy_features, false);
      assert.equal((await state(f.guild)).has_active_subscription, true);
      assert.deepEqual(
        await rpc("monetization_get_granted_features", [app, "guild", f.guild]),
        ["emotion_tags"],
      );
      assert.equal(
        (
          await sql(
            "select count(*)::integer n from monetization.guild_token_grants where entitlement_id=$1",
            [f.entitlement],
          )
        )[0].n,
        1,
      );
      await reserve(f.guild, "first-message", 500);
      await settle(f.guild, "first-message", 300);
      assert.equal((await state(f.guild)).token_balance, 14700);
      await settle(f.guild, "first-message", 300);
      assert.equal((await state(f.guild)).token_total_usage, 300);
      await assert.rejects(
        settle(f.guild, "first-message", 400),
        /cannot change/,
      );
    },
  );

  await t.test(
    "reservations bound concurrent spend, settle actual cost, and release failures",
    async () => {
      const f = await fixture();
      await f.grant();
      assert.equal((await reserve(f.guild, "a", 14000)).created, true);
      assert.equal((await reserve(f.guild, "a", 14000)).created, false);
      await assert.rejects(reserve(f.guild, "b", 1001), /Insufficient/);
      assert.equal((await state(f.guild)).token_balance, 1000);
      await settle(f.guild, "a", 10000);
      assert.equal((await state(f.guild)).token_balance, 5000);
      await reserve(f.guild, "b", 2000);
      await release(f.guild, "b");
      assert.equal((await state(f.guild)).token_balance, 5000);
      assert.equal((await reserve(f.guild, "b", 2000)).status, "released");
      await reserve(f.guild, "large-actual", 5000);
      await settle(f.guild, "large-actual", 5100);
      assert.equal((await state(f.guild)).token_balance, 0);
      assert.equal((await state(f.guild)).token_total_usage, 15100);
    },
  );

  await t.test(
    "a lost process conservatively settles its estimate and accepts one late actual",
    async () => {
      const f = await fixture();
      await f.grant();
      await reserve(f.guild, "lost", 1000);
      await sql(
        "update monetization.token_usage set expires_at=now()-interval '1 second' where guild_id=$1",
        [f.guild],
      );
      assert.equal((await state(f.guild)).token_total_usage, 1000);
      assert.equal((await reserve(f.guild, "lost", 1000)).created, false);
      await settle(f.guild, "lost", 700);
      assert.equal((await state(f.guild)).token_total_usage, 700);
      assert.equal((await state(f.guild)).token_balance, 14300);
      await settle(f.guild, "lost", 700);
      assert.equal((await state(f.guild)).token_total_usage, 700);
    },
  );

  await t.test(
    "a known late provider failure can release an estimate without duplicate credit",
    async () => {
      const f = await fixture();
      await f.grant();
      await reserve(f.guild, "known-failure", 1000);
      await sql(
        "update monetization.token_usage set expires_at=now()-interval '1 second' where guild_id=$1",
        [f.guild],
      );
      assert.equal((await state(f.guild)).token_total_usage, 1000);
      await release(f.guild, "known-failure");
      await release(f.guild, "known-failure");
      assert.equal((await state(f.guild)).token_balance, 15000);
      assert.equal((await state(f.guild)).token_total_usage, 0);
      assert.equal(
        (await reserve(f.guild, "known-failure", 1000)).created,
        false,
      );
    },
  );

  await t.test(
    "free requests spanning plan activation cannot increase the plan allowance",
    async () => {
      const f = await fixture();
      await reserve(f.guild, "before-plan", 1000);
      await f.grant();
      assert.equal((await state(f.guild)).token_balance, 15000);
      await release(f.guild, "before-plan");
      assert.equal((await state(f.guild)).token_balance, 15000);
      await sql(
        "update monetization.discord_entitlements set ends_at=now()-interval '1 second' where id=$1",
        [f.entitlement],
      );
      assert.equal((await state(f.guild)).token_balance, 5000);
    },
  );

  await t.test(
    "new-period failures retain a retry delay without overwriting successful delivery",
    async () => {
      const f = await fixture();
      await f.grant();
      await sql(
        "update monetization.guild_token_grants set period_start=period_start-interval '1 month',period_end=period_end-interval '1 month',expires_at=expires_at-interval '1 month' where entitlement_id=$1",
        [f.entitlement],
      );
      const pending = await rpc("monetization_reconcile_fulfillment", [
        app,
        f.entitlement,
      ]);
      assert.equal(pending.applied_state, "granted");
      assert.equal(pending.processing_status, "pending");
      await rpc("monetization_fulfillment_failure", [
        app,
        f.entitlement,
        pending.operation_id,
        "handler_failed",
      ]);
      const failed = await rpc("monetization_reconcile_fulfillment", [
        app,
        f.entitlement,
      ]);
      assert.equal(failed.processing_status, "failed");
      assert.ok(Date.parse(failed.next_attempt_at) > Date.now());
      assert.equal(failed.operation_id, pending.operation_id);
      await f.grant();
      await rpc("monetization_fulfillment_failure", [
        app,
        f.entitlement,
        pending.operation_id,
        "handler_failed",
      ]);
      assert.equal(
        (await rpc("monetization_reconcile_fulfillment", [app, f.entitlement]))
          .processing_status,
        "succeeded",
      );
      assert.equal((await state(f.guild)).token_balance, 15000);
    },
  );

  await t.test(
    "Plus retains one prior month, spends it first, and cannot roll it again",
    async () => {
      const f = await fixture({ rollover: 1 });
      await f.grant();
      const initial = (
        await sql(
          "select *,expires_at=period_end+interval '1 month' correct_expiry from monetization.guild_token_grants where entitlement_id=$1",
          [f.entitlement],
        )
      )[0];
      assert.equal(initial.correct_expiry, true);
      await reserve(f.guild, "old-spend", 12000);
      await settle(f.guild, "old-spend", 12000);
      // Move the first period back a month to model entering the next billing cycle.
      await sql(
        "update monetization.guild_token_grants set period_start=period_start-interval '1 month',period_end=period_end-interval '1 month',expires_at=expires_at-interval '1 month' where entitlement_id=$1",
        [f.entitlement],
      );
      const pending = await rpc("monetization_reconcile_fulfillment", [
        app,
        f.entitlement,
      ]);
      assert.equal(pending.processing_status, "pending");
      await f.grant();
      await f.grant();
      assert.equal((await state(f.guild)).token_balance, 18000);
      await reserve(f.guild, "new-spend", 4000);
      await settle(f.guild, "new-spend", 4000);
      const grants = await sql(
        "select remaining from monetization.guild_token_grants where entitlement_id=$1 order by period_start",
        [f.entitlement],
      );
      assert.deepEqual(
        grants.map((g) => g.remaining),
        [0, 14000],
      );
      await sql(
        "update monetization.guild_token_grants set period_start=period_start-interval '2 months',period_end=period_end-interval '2 months',expires_at=expires_at-interval '2 months' where entitlement_id=$1",
        [f.entitlement],
      );
      assert.equal((await state(f.guild)).token_balance, 0);
    },
  );

  await t.test(
    "Starter expiry deducts only unused tokens, and failed reservations cannot extend expiry",
    async () => {
      const f = await fixture();
      await f.grant();
      await reserve(f.guild, "expired-request", 1000);
      await sql(
        "update monetization.guild_token_grants set period_start=period_start-interval '1 month',period_end=period_end-interval '1 month',expires_at=expires_at-interval '1 month' where entitlement_id=$1",
        [f.entitlement],
      );
      assert.equal((await state(f.guild)).token_balance, 0);
      await release(f.guild, "expired-request");
      assert.equal((await state(f.guild)).token_balance, 0);
      assert.equal((await state(f.guild)).token_total_usage, 0);
      assert.equal(
        (
          await sql(
            "select revoked_quantity from monetization.guild_token_grants where entitlement_id=$1",
            [f.entitlement],
          )
        )[0].revoked_quantity,
        15000,
      );
    },
  );

  await t.test(
    "cancellation preserves access until entitlement expiry, then restores free tokens once",
    async () => {
      const f = await fixture({ rollover: 1 });
      await f.grant();
      await sql(
        "update monetization.discord_purchases set canceled_at=now(),status=2 where id=$1",
        [f.subscription],
      );
      assert.equal((await state(f.guild)).has_active_subscription, true);
      await reserve(f.guild, "spent", 4000);
      await settle(f.guild, "spent", 4000);
      await sql(
        "update monetization.discord_entitlements set ends_at=now()-interval '1 second' where id=$1",
        [f.entitlement],
      );
      await rpc("monetization_reconcile_fulfillment", [app, f.entitlement]);
      await f.remove();
      await f.remove();
      const ended = await state(f.guild);
      assert.equal(ended.has_active_subscription, false);
      assert.equal(ended.token_balance, 5000);
      assert.equal(ended.token_total_usage, 4000);
      assert.equal(ended.legacy_features, false);
      assert.deepEqual(
        await rpc("monetization_get_granted_features", [app, "guild", f.guild]),
        [],
      );
    },
  );

  await t.test(
    "refund reverses the latest period, not older paid-month spending",
    async () => {
      const f = await fixture({ rollover: 1 });
      await f.grant();
      await reserve(f.guild, "old-paid-month", 10000);
      await settle(f.guild, "old-paid-month", 10000);
      await sql(
        "update monetization.guild_token_grants set period_start=period_start-interval '1 month',period_end=period_end-interval '1 month',expires_at=expires_at-interval '1 month' where entitlement_id=$1",
        [f.entitlement],
      );
      await f.grant();
      await reserve(f.guild, "current-month", 8000);
      await settle(f.guild, "current-month", 8000);
      await sql(
        "update monetization.discord_entitlements set deleted=true where id=$1",
        [f.entitlement],
      );
      await rpc("monetization_reconcile_fulfillment", [app, f.entitlement]);
      await f.remove();
      const refunded = await state(f.guild);
      // Old 5,000 rollover was spent first; current month spent 3,000 is reversed.
      assert.equal(refunded.token_balance, 2000);
      await f.remove();
      assert.equal((await state(f.guild)).token_balance, 2000);
    },
  );

  await t.test(
    "top-ups bind only the actual buyer to one guild and survive plan expiry",
    async () => {
      const plan = await fixture();
      await plan.grant();
      const topup = await fixture({ topup: true, existingGuild: plan.guild });
      await assert.rejects(topup.redeem("999"), /does not belong/);
      await topup.redeem();
      await topup.redeem();
      await assert.rejects(topup.redeem(topup.buyer, "401"), /another guild/);
      await topup.grant();
      await topup.grant();
      assert.equal((await state(plan.guild)).token_balance, 16000);
      assert.equal(
        (
          await sql(
            "select guild_id from monetization.discord_entitlements where id=$1",
            [topup.entitlement],
          )
        )[0].guild_id,
        null,
      );
      assert.ok(
        (
          await rpc("monetization_fulfillment_entitlements", [app, null, 100])
        ).includes(topup.entitlement),
      );
      assert.ok(
        (
          await rpc("monetization_pending_consumptions", [app, null, 100])
        ).includes(topup.entitlement),
      );
      await rpc("monetization_record_consumed_purchase", [
        app,
        topup.entitlement,
      ]);
      assert.ok(
        !(
          await rpc("monetization_pending_consumptions", [app, null, 100])
        ).includes(topup.entitlement),
      );
      await topup.grant();
      await sql(
        "update monetization.discord_entitlements set ends_at=now()-interval '1 second' where id=$1",
        [plan.entitlement],
      );
      await rpc("monetization_reconcile_fulfillment", [app, plan.entitlement]);
      await plan.remove();
      assert.equal((await state(plan.guild)).token_balance, 6000);
      await reserve(plan.guild, "spend-topup", 1000);
      await settle(plan.guild, "spend-topup", 1000);
      await sql(
        "update monetization.discord_entitlements set deleted=true where id=$1",
        [topup.entitlement],
      );
      await rpc("monetization_reconcile_fulfillment", [app, topup.entitlement]);
      await topup.remove();
      assert.equal((await state(plan.guild)).token_balance, 4000);
      await topup.remove();
      assert.equal((await state(plan.guild)).token_balance, 4000);
    },
  );

  await t.test(
    "unconfigured consumption and unsafe recipients are rejected",
    async () => {
      const topup = await fixture({ topup: true });
      await assert.rejects(
        rpc("monetization_record_consumed_purchase", [app, topup.entitlement]),
        /not been delivered/,
      );
      await sql("update public.guilds set is_banned=true where id=$1", [
        topup.guild,
      ]);
      await assert.rejects(topup.redeem(), /missing or banned/);
      await assert.rejects(
        reserve(topup.guild, "banned-request", 1),
        /Guild is banned/,
      );
      await sql("update public.guilds set is_banned=false where id=$1", [
        topup.guild,
      ]);
      await sql(
        "update monetization.sku_features set grant_settings=grant_settings-'redeem_to_guild' where sku_id=$1",
        [topup.sku],
      );
      await assert.rejects(topup.redeem(), /not configured/);
    },
  );

  await t.test(
    "allocation failure rolls back both benefits and completion",
    async () => {
      const f = await fixture();
      await sql(
        "create function public.fail_plan() returns trigger language plpgsql as $$ begin raise exception 'Forced failure'; end $$",
      );
      await sql(
        "create trigger fail_plan before insert on monetization.purchase_features for each row execute function public.fail_plan()",
      );
      await assert.rejects(f.grant(), /Forced failure/);
      await sql("drop trigger fail_plan on monetization.purchase_features");
      await sql("drop function public.fail_plan()");
      assert.equal((await state(f.guild)).token_balance, 5000);
      assert.equal(
        (
          await sql(
            "select count(*)::integer n from monetization.guild_token_grants where entitlement_id=$1",
            [f.entitlement],
          )
        )[0].n,
        0,
      );
      assert.equal(
        (
          await rpc("monetization_get_purchase_fulfillment", [
            app,
            f.entitlement,
          ])
        ).applied_state,
        "ungranted",
      );
    },
  );

  await t.test(
    "private data and every new write RPC deny untrusted database roles",
    async () => {
      for (const role of ["anon", "authenticated"]) {
        await db.exec(`set role ${role}`);
        for (const query of [
          "select * from monetization.guild_token_grants",
          "select * from monetization.topup_redemptions",
          "select * from monetization.token_usage",
          "select public.monetization_grant_plan('100','1')",
          "select public.monetization_redeem_topup('100','1','2','400')",
          "select public.monetization_get_guild_token_state('400')",
          "select public.monetization_reserve_guild_tokens('400','x',1)",
          "select public.monetization_settle_guild_tokens('400','x',1)",
          "select public.monetization_release_guild_tokens('400','x')",
          "select public.monetization_record_consumed_purchase('100','1')",
        ])
          await assert.rejects(db.query(query), /permission denied/);
      }
    },
  );
});
