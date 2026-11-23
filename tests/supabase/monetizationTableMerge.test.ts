import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const app = "100";
const migration = "20261122010000_unify_monetization_purchases.sql";

test("monetization table merge preserves populated history and every fulfillment path", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table public.discord_users(id text primary key,username text not null);
    create table public.guilds(id text primary key,token_limit integer not null default 5000,
      token_total_usage integer not null default 1000,token_balance integer not null default 4000);
    insert into public.guilds(id) values('400');
    alter default privileges grant execute on functions to anon,authenticated,service_role;
  `);
  async function apply(file: string) {
    await db.exec("reset role");
    await db.exec(
      await readFile(
        new URL(`../../supabase/migrations/${file}`, import.meta.url),
        "utf8",
      ),
    );
  }
  for (const file of [
    "20261107000000_discord_monetization_records.sql",
    "20261107010000_remove_monetization_financial_records.sql",
    "20261112000000_shared_supabase_monetization.sql",
    "20261112010000_sku_fulfillment_state.sql",
    "20261114000000_fulfillment_actions.sql",
    "20261115000000_token_fulfillment_actions.sql",
    "20261115010000_guild_fulfillment_dispatch.sql",
  ])
    await apply(file);
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
  const state = (id: string) =>
    rpc("monetization_get_purchase_fulfillment", [app, id]);
  const features = () =>
    rpc("monetization_get_granted_features", [app, "guild", "400"]);
  const read = (
    kind: string,
    user: string | null = null,
    guild: string | null = null,
    application = app,
  ) =>
    rpc("monetization_read_records", [
      kind,
      application,
      user,
      guild,
      null,
      100,
    ]);
  let observed = Date.now();
  const config = (sku: string, extra = {}) =>
    rpc("monetization_upsert_sku_action", [
      {
        application_id: app,
        sku_id: sku,
        enabled: true,
        mode: "once",
        grant_action: "grant_tokens",
        grant_settings: { quantity: 10000 },
        remove_action: "remove_tokens",
        remove_settings: {},
        effective_from: "2020-01-01T00:00:00Z",
        ...extra,
      },
    ]);
  const record = (id: string, extra = {}) =>
    rpc("monetization_apply_entitlement", [
      {
        applicationId: app,
        id,
        skuId: "200",
        userId: "300",
        guildId: "400",
        type: 1,
        startsAt: null,
        endsAt: null,
        consumed: false,
        deleted: false,
        createdAt: "2026-01-01T00:00:00Z",
        observedAt: new Date(++observed).toISOString(),
        ...extra,
      },
    ]);
  const subscription = (extra = {}) =>
    rpc("monetization_apply_subscription", [
      {
        applicationId: app,
        id: "500",
        userId: "300",
        skuIds: ["202"],
        entitlementIds: ["600"],
        renewalSkuIds: ["203"],
        status: 0,
        currentPeriodStart: "2026-01-01T00:00:00Z",
        currentPeriodEnd: "2099-01-01T00:00:00Z",
        canceledAt: null,
        createdAt: "2026-01-01T00:00:00Z",
        observedAt: new Date(++observed).toISOString(),
        deleted: false,
        ...extra,
      },
    ]);
  await rpc("monetization_upsert_skus", [
    [
      { id: "200", name: "Tokens", type: 3 },
      { id: "201", name: "Features", type: 2 },
      { id: "202", name: "Subscription", type: 5 },
      { id: "203", name: "Replacement subscription", type: 5 },
    ].map((sku) => ({
      ...sku,
      applicationId: app,
      flags: 4,
      observedAt: new Date(++observed).toISOString(),
    })),
  ]);
  await config("200");
  await config("201", {
    mode: "while_active",
    grant_action: "grant_features",
    grant_settings: { features: ["emotion_tags", "voice_selection"] },
    remove_action: "remove_features",
  });
  await record("500"); // Deliberately collides with the subscription ID in another type.
  await subscription();
  await record("600", { skuId: "202", type: 8 });
  await record("601", { skuId: "201" });
  await record("602");
  await rpc("monetization_grant_tokens", [app, "500"]);
  await rpc("monetization_grant_features", [app, "601"]);
  const failed = await state("602");
  await rpc("monetization_fulfillment_failure", [
    app,
    "602",
    failed.operation_id,
    "handler_failed",
  ]);

  const beforeSubscriptions = await read("subscriptions");
  const beforePurchases = await read("one_time_purchases");
  const beforeStates = await Promise.all(["500", "601", "602"].map(state));
  const beforeConfigs = await Promise.all(
    ["200", "201"].map((sku) => rpc("monetization_get_sku_action", [app, sku])),
  );
  const beforeFeatureRows = await sql(
    "select * from monetization.feature_grants order by feature",
  );
  const beforeGuild = await sql("select * from public.guilds");
  const beforeEntitlements = await sql(
    "select to_jsonb(e) as row from monetization.entitlements e order by id",
  );
  await t.test(
    "a late migration failure rolls back table renames, copied rows and rewritten functions",
    async () => {
      const source = await readFile(
        new URL(`../../supabase/migrations/${migration}`, import.meta.url),
        "utf8",
      );
      // The CLI executes separate statements, so the file must own its transaction.
      const statements = source.replace(/--[^\r\n]*/g, "").trim();
      assert.match(statements, /^begin;/i);
      assert.match(statements, /commit;$/i);
      const retirement = "drop table monetization.one_time_purchases;";
      assert.ok(source.includes(retirement));
      await assert.rejects(
        db.exec(source.replace(retirement, `select 1/0;\n${retirement}`)),
        /division by zero/i,
      );
      await db.exec("rollback");
      assert.deepEqual(await read("subscriptions"), beforeSubscriptions);
      assert.deepEqual(await read("one_time_purchases"), beforePurchases);
      assert.deepEqual(
        await Promise.all(["500", "601", "602"].map(state)),
        beforeStates,
      );
      assert.deepEqual(await sql("select * from public.guilds"), beforeGuild);
      assert.deepEqual(
        await sql(
          "select to_regclass('monetization.discord_purchases') as merged,to_regclass('monetization.purchase_deliveries') as deliveries",
        ),
        [{ merged: null, deliveries: null }],
      );
    },
  );
  await apply(migration);

  await t.test(
    "merges colliding IDs without losing history, snapshots, grants, balances or legacy read shapes",
    async () => {
      assert.deepEqual(await read("subscriptions"), beforeSubscriptions);
      assert.deepEqual(await read("one_time_purchases"), beforePurchases);
      assert.deepEqual(
        await Promise.all(["500", "601", "602"].map(state)),
        beforeStates,
      );
      assert.deepEqual(
        await Promise.all(
          ["200", "201"].map((sku) =>
            rpc("monetization_get_sku_action", [app, sku]),
          ),
        ),
        beforeConfigs,
      );
      assert.deepEqual(
        await sql(
          "select * from monetization.purchase_features order by feature",
        ),
        beforeFeatureRows,
      );
      assert.deepEqual(await sql("select * from public.guilds"), beforeGuild);
      const entitlements = await sql(
        "select to_jsonb(e)-'subscription_type' as row from monetization.discord_entitlements e order by id",
      );
      assert.deepEqual(entitlements, beforeEntitlements);
      assert.deepEqual(
        await sql(
          "select type,id from monetization.discord_purchases where id='500' order by type",
        ),
        [
          { type: "one_time", id: "500" },
          { type: "subscription", id: "500" },
        ],
      );
      assert.deepEqual(
        (
          await sql(
            "select tablename from pg_tables where schemaname='monetization' order by tablename",
          )
        ).map((r) => r.tablename),
        [
          "discord_entitlements",
          "discord_purchases",
          "discord_subscription_skus",
          "purchase_deliveries",
          "purchase_features",
          "sku_features",
          "skus",
        ],
      );
      assert.deepEqual(await features(), ["emotion_tags", "voice_selection"]);
    },
  );

  await t.test(
    "typed foreign keys reject one-time rows as subscriptions and preserve application isolation",
    async () => {
      await assert.rejects(
        sql(
          "update monetization.discord_entitlements set subscription_id='602' where id='600'",
        ),
        /foreign key/i,
      );
      await assert.rejects(
        sql(
          "insert into monetization.discord_subscription_skus(application_id,subscription_id,sku_id,title) values('100','602','202','invalid')",
        ),
        /foreign key/i,
      );
      await assert.rejects(
        sql(
          "update monetization.discord_purchases set type='invalid' where type='one_time' and id='602'",
        ),
        /check constraint/i,
      );
      await assert.rejects(
        sql(
          "update monetization.discord_purchases set status=0 where type='one_time' and id='602'",
        ),
        /check constraint/i,
      );
      await assert.rejects(
        sql(
          "update monetization.discord_purchases set consumed=false where type='subscription' and id='500'",
        ),
        /check constraint/i,
      );
      assert.deepEqual(await read("subscriptions", null, null, "101"), []);
      assert.deepEqual(await read("one_time_purchases", "999"), []);
      assert.deepEqual(
        await read("subscriptions", "300", "400"),
        beforeSubscriptions,
      );
      assert.deepEqual(await read("one_time_purchases", null, "999"), []);
    },
  );

  await t.test(
    "subscription updates retain historical SKU links without modifying the same-ID one-time purchase",
    async () => {
      await subscription({
        skuIds: ["203"],
        status: 1,
        canceledAt: "2026-11-22T00:00:00Z",
      });
      const current = (await read("subscriptions"))[0];
      assert.equal(current.status, 1);
      assert.deepEqual(
        current.items.map((i: any) => [i.sku_id, i.is_current]),
        [
          ["202", false],
          ["203", true],
        ],
      );
      assert.deepEqual(
        (await read("one_time_purchases")).find((p: any) => p.id === "500"),
        beforePurchases.find((p: any) => p.id === "500"),
      );
      await subscription({ status: 0, observedAt: "2020-01-01T00:00:00Z" });
      assert.equal((await read("subscriptions"))[0].status, 1);
      await assert.rejects(
        subscription({ userId: "301" }),
        /purchaser cannot change/i,
      );
      await sql(
        "insert into public.discord_users(id,username) values('300','example')",
      );
      const linked = await sql(
        "select type,discord_user_id from monetization.discord_purchases where id='500' order by type",
      );
      assert.deepEqual(linked, [
        { type: "one_time", discord_user_id: "300" },
        { type: "subscription", discord_user_id: "300" },
      ]);
      assert.deepEqual(
        await rpc("monetization_known_purchasers", [app, null, 100]),
        ["300"],
      );
    },
  );

  await t.test(
    "post-merge token grants, monotonic consumption, deletion and removal preserve retries and type boundaries",
    async () => {
      assert.deepEqual(
        await rpc("monetization_grant_tokens", [app, "500"]),
        beforeStates[0],
      );
      await record("500", { consumed: true });
      await record("500", { consumed: false });
      assert.equal(
        (await read("one_time_purchases")).find((p: any) => p.id === "500")
          .consumed,
        true,
      );
      assert.equal((await state("500")).desired_state, "granted");
      await record("500", { deleted: true });
      await record("500");
      assert.equal(
        (await read("one_time_purchases")).find((p: any) => p.id === "500")
          .deleted,
        true,
      );
      assert.equal((await read("subscriptions"))[0].deleted, false);
      assert.equal((await state("500")).desired_state, "removed");
      const removed = await rpc("monetization_remove_tokens", [app, "500"]);
      assert.deepEqual(
        await rpc("monetization_remove_tokens", [app, "500"]),
        removed,
      );
      assert.equal(
        (await sql("select token_limit from public.guilds"))[0].token_limit,
        5000,
      );
      await record("610");
      assert.equal(
        (await rpc("monetization_create_purchase_fulfillment", [app, "610"]))
          .target_id,
        "400",
      );
      await rpc("monetization_grant_tokens", [app, "610"]);
      assert.equal(
        (await sql("select token_limit from public.guilds"))[0].token_limit,
        15000,
      );
    },
  );

  await t.test(
    "feature removal, reconciliation, failures and no-op dispatch use renamed tables",
    async () => {
      await record("601", { skuId: "201", endsAt: "2020-01-01T00:00:00Z" });
      assert.equal(
        (await rpc("monetization_reconcile_fulfillment", [app, "601"]))
          .desired_state,
        "removed",
      );
      assert.deepEqual(await features(), []);
      await rpc("monetization_remove_features", [app, "601"]);
      assert.ok(
        (
          await sql(
            "select removed_at from monetization.purchase_features where entitlement_id='601'",
          )
        )[0].removed_at,
      );
      await record("611", { skuId: "201" });
      await rpc("monetization_grant_features", [app, "611"]);
      assert.deepEqual(await features(), ["emotion_tags", "voice_selection"]);
      await config("201", {
        grant_action: "none",
        grant_settings: {},
        remove_action: "none",
      });
      await record("612", { skuId: "201" });
      const pending = await state("612");
      await rpc("monetization_fulfillment_failure", [
        app,
        "612",
        pending.operation_id,
        "unsupported_action",
      ]);
      assert.equal((await state("612")).processing_status, "failed");
      const finished = await rpc("monetization_complete_noop_fulfillment", [
        app,
        "612",
      ]);
      assert.equal(finished.processing_status, "succeeded");
      await rpc("monetization_fulfillment_failure", [
        app,
        "612",
        pending.operation_id,
        "handler_failed",
      ]);
      assert.equal((await state("612")).processing_status, "succeeded");
      const ids = await rpc("monetization_fulfillment_entitlements", [
        app,
        "610",
        100,
      ]);
      assert.deepEqual(ids, ["611", "612"]);
    },
  );

  await t.test(
    "new same-ID purchases link subscription entitlements without crossing types",
    async () => {
      await record("700");
      await record("701", { skuId: "202", type: 8 });
      await subscription({ id: "700", entitlementIds: ["701"] });
      const rows = await sql(
        "select type,id from monetization.discord_purchases where id='700' order by type",
      );
      assert.deepEqual(rows, [
        { type: "one_time", id: "700" },
        { type: "subscription", id: "700" },
      ]);
      assert.equal(
        (
          await sql(
            "select subscription_id from monetization.discord_entitlements where id='701'",
          )
        )[0].subscription_id,
        "700",
      );
      await subscription({ id: "700", entitlementIds: ["701"], deleted: true });
      await subscription({
        id: "700",
        entitlementIds: ["701"],
        deleted: false,
      });
      assert.equal(
        (await read("subscriptions")).find((row: any) => row.id === "700")
          .deleted,
        true,
      );
      assert.equal(
        (await read("one_time_purchases")).find((row: any) => row.id === "700")
          .deleted,
        false,
      );
      await assert.rejects(
        record("700", { guildId: "401" }),
        /identity cannot change/i,
      );
    },
  );

  await t.test(
    "renamed private tables remain inaccessible and public RPC privileges remain service-only",
    async () => {
      for (const role of ["anon", "authenticated", "service_role"]) {
        await db.exec(`set role ${role}`);
        for (const table of [
          "discord_purchases",
          "discord_entitlements",
          "discord_subscription_skus",
          "sku_features",
          "purchase_deliveries",
          "purchase_features",
          "skus",
        ])
          await assert.rejects(
            db.query(`select * from monetization.${table}`),
            /permission denied/i,
          );
      }
      for (const role of ["anon", "authenticated"]) {
        await db.exec(`set role ${role}`);
        for (const query of [
          "select public.monetization_read_records('subscriptions','100')",
          "select public.monetization_apply_entitlement('{}')",
          "select public.monetization_grant_tokens('100','610')",
          "select public.monetization_reconcile_fulfillment('100','610')",
          "select public.monetization_get_granted_features('100','guild','400')",
        ])
          await assert.rejects(db.query(query), /permission denied/i);
      }
      const rows = await sql(
        "select relname,relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='monetization' and c.relkind='r'",
      );
      assert.equal(rows.length, 7);
      assert.ok(rows.every((row) => row.relrowsecurity));
    },
  );
});
