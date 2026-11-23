import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const app = "100";
const sku = "200";
const configuration = {
  application_id: app,
  sku_id: sku,
  enabled: true,
  mode: "while_active",
  grant_action: "grant_features",
  grant_settings: { features: ["emotions", "voice_selection"] },
  remove_action: "remove_features",
  remove_settings: {},
  effective_from: "2020-01-01T00:00:00.000Z",
};

test("fulfillment actions apply feature effects and completion together", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table public.discord_users(id text primary key, username text not null);
    create table public.guilds(id text primary key, token_limit integer not null default 5000,
      token_total_usage integer not null default 0, token_balance integer not null default 0);
    insert into public.guilds(id) values('400');
    alter default privileges grant execute on functions to anon, authenticated, service_role;
  `);
  for (const file of [
    "20261107000000_discord_monetization_records.sql",
    "20261107010000_remove_monetization_financial_records.sql",
    "20261112000000_shared_supabase_monetization.sql",
    "20261112010000_sku_fulfillment_state.sql",
    "20261114000000_fulfillment_actions.sql",
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
    const placeholders = args.map((_, i) => `$${i + 1}`).join(",");
    const result = await db.query<{ result: any }>(
      `select public.${name}(${placeholders}) as result`,
      args.map((value) =>
        value !== null && typeof value === "object"
          ? JSON.stringify(value)
          : value,
      ),
    );
    return result.rows[0]?.result;
  }
  let observation = Date.now();
  async function record(id: string, extra = {}) {
    await rpc("monetization_apply_entitlement", [
      {
        applicationId: app,
        id,
        skuId: sku,
        userId: "300",
        guildId: "400",
        type: 1,
        startsAt: null,
        endsAt: null,
        consumed: false,
        deleted: false,
        createdAt: "2026-01-01T00:00:00.000Z",
        observedAt: new Date(++observation).toISOString(),
        ...extra,
      },
    ]);
  }
  async function configure(extra = {}) {
    return rpc("monetization_upsert_sku_action", [
      { ...configuration, ...extra },
    ]);
  }
  async function prepare(
    id: string,
    targetType: string | null = "guild",
    targetId: string | null = "400",
  ) {
    await record(id);
    return rpc("monetization_create_purchase_fulfillment", [
      app,
      id,
      targetType,
      targetId,
    ]);
  }
  const grant = (id: string) => rpc("monetization_grant_features", [app, id]);
  const remove = (id: string) => rpc("monetization_remove_features", [app, id]);
  const state = (id: string) =>
    rpc("monetization_get_purchase_fulfillment", [app, id]);
  const features = (type = "guild", id = "400", application = app) =>
    rpc("monetization_get_granted_features", [application, type, id]);
  await rpc("monetization_upsert_skus", [
    [
      {
        applicationId: app,
        id: sku,
        name: "Feature access",
        type: 2,
        flags: 4,
        observedAt: new Date().toISOString(),
      },
    ],
  ]);

  await t.test(
    "grants use the frozen configuration and retries preserve completion",
    async () => {
      await configure();
      const prepared = await prepare("600");
      await configure({
        grant_settings: { features: ["higher_voice_modules"] },
        enabled: false,
      });
      const granted = await grant("600");
      assert.equal(granted.applied_state, "granted");
      assert.equal(granted.processing_status, "succeeded");
      assert.equal(granted.attempt_count, 1);
      assert.equal(granted.operation_id, prepared.operation_id);
      assert.ok(granted.granted_at);
      assert.deepEqual(granted.grant_result, {
        features: ["emotions", "voice_selection"],
      });
      assert.deepEqual(await features(), ["emotions", "voice_selection"]);
      assert.deepEqual(await grant("600"), granted);
      assert.deepEqual(await features("user", "300"), []);
      assert.deepEqual(await features("guild", "401"), []);
      assert.deepEqual(await features("guild", "400", "101"), []);
    },
  );

  await t.test(
    "removing one source preserves overlapping grants and is idempotent",
    async () => {
      await configure({
        grant_settings: { features: ["emotions", "emotions"] },
      });
      await prepare("601");
      await grant("601");
      const removed = await remove("600");
      assert.equal(removed.applied_state, "removed");
      assert.equal(removed.desired_state, "removed");
      assert.equal(removed.processing_status, "succeeded");
      assert.equal(removed.attempt_count, 2);
      assert.ok(removed.removed_at);
      assert.deepEqual(removed.grant_result, {
        features: ["emotions", "voice_selection"],
      });
      assert.deepEqual(await features(), ["emotions"]);
      assert.deepEqual(await remove("600"), removed);
      await remove("601");
      assert.deepEqual(await features(), []);
      await assert.rejects(grant("600"), /has been removed/);
      await db.exec("reset role");
      const history = await db.query(
        "select * from monetization.feature_grants where entitlement_id='600' and removed_at is not null",
      );
      assert.equal(history.rows.length, 2);
    },
  );

  await t.test(
    "user grants stay separate and removal before delivery blocks a late grant",
    async () => {
      await configure();
      await prepare("602", "user", "300");
      await grant("602");
      assert.deepEqual(await features("user", "300"), [
        "emotions",
        "voice_selection",
      ]);
      assert.deepEqual(await features(), []);
      await prepare("603");
      const removed = await remove("603");
      assert.equal(removed.granted_at, null);
      assert.equal(removed.grant_result, null);
      assert.equal(removed.applied_state, "removed");
      await assert.rejects(grant("603"), /has been removed/);
      assert.deepEqual(await remove("603"), removed);
      await remove("602");
      assert.deepEqual(await features("user", "300"), []);
    },
  );

  await t.test(
    "invalid settings leave fulfillment and effects unchanged",
    async () => {
      const settings = [
        {},
        { features: null },
        { features: "emotions" },
        { features: [] },
        { features: ["emotions", 123] },
        { features: ["emotions", "Bad Feature"] },
        { features: ["emotions", null] },
        { features: Array.from({ length: 65 }, (_, i) => `feature_${i}`) },
      ];
      for (const [index, grant_settings] of settings.entries()) {
        await configure({ grant_settings });
        const id = String(610 + index);
        const before = await prepare(id);
        await assert.rejects(
          grant(id),
          /Features must be an array|Invalid feature names/,
        );
        assert.deepEqual(await state(id), before);
        assert.deepEqual(await features(), []);
      }
    },
  );

  await t.test(
    "unresolved recipients, wrong handlers, and changed entitlement eligibility are rejected",
    async () => {
      await configure();
      await prepare("630", null, null);
      await assert.rejects(grant("630"), /recipient is unresolved/);
      await configure({ grant_action: "grant_tokens" });
      await prepare("631");
      await assert.rejects(grant("631"), /does not match feature handler/);
      await assert.rejects(remove("631"), /does not match feature handler/);
      await configure();
      for (const [index, extra] of [
        { deleted: true },
        { consumed: true },
        { startsAt: "2099-01-01T00:00:00Z" },
        { endsAt: "2020-01-01T00:00:00Z" },
      ].entries()) {
        const id = String(640 + index);
        const before = await prepare(id);
        await record(id, extra);
        await assert.rejects(grant(id), /not eligible for granting/);
        assert.deepEqual(await state(id), before);
      }
      await assert.rejects(grant("999"), /Entitlement not found/);
      await record("644");
      await assert.rejects(grant("644"), /Fulfillment not found/);
      await assert.rejects(
        features("other", "400"),
        /Invalid feature recipient/,
      );
      assert.deepEqual(await features(), []);
    },
  );

  await t.test(
    "action RPCs require service role and private tables and helpers stay inaccessible",
    async () => {
      for (const role of ["anon", "authenticated"]) {
        await db.exec(`set role ${role}`);
        for (const query of [
          "select public.monetization_grant_features('100','600')",
          "select public.monetization_remove_features('100','600')",
          "select public.monetization_get_granted_features('100','guild','400')",
        ])
          await assert.rejects(db.query(query), /permission denied/);
      }
      for (const role of ["anon", "authenticated", "service_role"]) {
        await db.exec(`set role ${role}`);
        await assert.rejects(
          db.query("select * from monetization.feature_grants"),
          /permission denied/,
        );
        await assert.rejects(
          db.query(
            "select monetization.apply_feature_action('100','600',false)",
          ),
          /permission denied/,
        );
      }
    },
  );
});
