import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const app = "100";
const sku = "200";
const configured = {
  application_id: app,
  sku_id: sku,
  enabled: true,
  mode: "once",
  grant_action: "grant_tokens",
  grant_settings: { quantity: 10000 },
  remove_action: "remove_token_grant",
  remove_settings: {},
  effective_from: "2020-01-01T00:00:00.000Z",
};

test("SKU configuration and fulfillment preparation preserve purchase history without executing actions", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(
    "create role anon; create role authenticated; create role service_role; create table public.discord_users(id text primary key, username text not null); alter default privileges grant execute on functions to anon, authenticated, service_role;",
  );
  for (const file of [
    "20261107000000_discord_monetization_records.sql",
    "20261107010000_remove_monetization_financial_records.sql",
    "20261112000000_shared_supabase_monetization.sql",
    "20261112010000_sku_fulfillment_state.sql",
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
  async function record(id: string, extra = {}) {
    await rpc("monetization_apply_entitlement", [
      {
        applicationId: app,
        id,
        skuId: sku,
        userId: "300",
        guildId: null,
        type: 1,
        startsAt: null,
        endsAt: null,
        consumed: false,
        deleted: false,
        createdAt: "2026-01-01T00:00:00.000Z",
        observedAt: new Date().toISOString(),
        ...extra,
      },
    ]);
  }
  async function prepare(
    id: string,
    targetType: string | null = null,
    targetId: string | null = null,
  ) {
    return rpc("monetization_create_purchase_fulfillment", [
      app,
      id,
      targetType,
      targetId,
    ]);
  }
  await rpc("monetization_upsert_skus", [
    [
      {
        applicationId: app,
        id: sku,
        name: "Token pack",
        type: 3,
        flags: 4,
        observedAt: new Date().toISOString(),
      },
    ],
  ]);

  await t.test(
    "unknown and disabled mappings do not prepare actions; recording itself is unchanged",
    async () => {
      await record("600");
      assert.equal(await prepare("600"), null);
      assert.equal(await rpc("monetization_get_sku_action", [app, sku]), null);
      const config = await rpc("monetization_upsert_sku_action", [
        { application_id: app, sku_id: sku },
      ]);
      assert.equal(config.enabled, false);
      assert.equal(config.mode, "once");
      assert.equal(config.grant_action, "none");
      assert.equal(config.version, 1);
      assert.equal(await prepare("600"), null);
      assert.equal(
        await rpc("monetization_get_purchase_fulfillment", [app, "600"]),
        null,
      );
      await db.exec("reset role");
      assert.equal(
        (
          await db.query(
            "select * from monetization.one_time_purchases where id='600'",
          )
        ).rows.length,
        1,
      );
      assert.equal(
        (await db.query("select * from monetization.purchase_fulfillments"))
          .rows.length,
        0,
      );
    },
  );

  await t.test(
    "configuration revisions change only for meaningful edits, including dashboard updates",
    async () => {
      const config = await rpc("monetization_upsert_sku_action", [configured]);
      assert.equal(config.version, 2);
      const repeated = await rpc("monetization_upsert_sku_action", [
        configured,
      ]);
      assert.equal(repeated.version, 2);
      assert.equal(repeated.created_at, config.created_at);
      await db.exec("reset role");
      await db.exec(
        "update monetization.sku_actions set version=999,created_at='2000-01-01' where application_id='100' and sku_id='200'",
      );
      assert.equal(
        (await rpc("monetization_get_sku_action", [app, sku])).version,
        2,
      );
      assert.equal(
        (await rpc("monetization_get_sku_action", [app, sku])).created_at,
        config.created_at,
      );
      await db.exec("reset role");
      await db.exec(
        "update monetization.sku_actions set grant_settings='{\"quantity\":20000}' where application_id='100' and sku_id='200'",
      );
      assert.equal(
        (await rpc("monetization_get_sku_action", [app, sku])).version,
        3,
      );
      await rpc("monetization_upsert_sku_action", [configured]);
    },
  );

  await t.test(
    "preparation snapshots settings and is idempotent across configuration edits",
    async () => {
      const before = await rpc("monetization_get_sku_action", [app, sku]);
      const first = await prepare("600");
      assert.equal(first.processing_status, "awaiting_recipient");
      assert.equal(first.applied_state, "ungranted");
      assert.equal(first.desired_state, "granted");
      assert.equal(first.config_version, before.version);
      assert.deepEqual(first.action_snapshot, {
        mode: "once",
        grant_action: "grant_tokens",
        grant_settings: { quantity: 10000 },
        remove_action: "remove_token_grant",
        remove_settings: {},
      });
      assert.equal(first.target_type, null);
      assert.equal(first.target_id, null);
      assert.equal(first.grant_result, null);
      assert.equal(first.attempt_count, 0);
      await rpc("monetization_upsert_sku_action", [
        { ...configured, enabled: false, grant_settings: { quantity: 20000 } },
      ]);
      const repeated = await prepare("600", "user", "300");
      assert.deepEqual(repeated, first);
      assert.deepEqual(
        await rpc("monetization_get_purchase_fulfillment", [app, "600"]),
        first,
      );
      await rpc("monetization_upsert_sku_action", [configured]);
      await record("601");
      const selected = await prepare("601", "guild", "400");
      assert.equal(selected.processing_status, "pending");
      assert.equal(selected.target_type, "guild");
      assert.equal(selected.target_id, "400");
      assert.notEqual(selected.operation_id, first.operation_id);
      await db.exec("reset role");
      await assert.rejects(
        db.exec(
          "update monetization.purchase_fulfillments set action_snapshot='{}' where entitlement_id='600'",
        ),
        /snapshot cannot change/,
      );
      await assert.rejects(
        db.exec(
          "update monetization.purchase_fulfillments set target_id='401' where entitlement_id='601'",
        ),
        /recipient cannot change/,
      );
      await db.exec(
        "update monetization.purchase_fulfillments set target_type='user',target_id='300',processing_status='pending' where entitlement_id='600'",
      );
      await assert.rejects(
        db.exec(
          "update monetization.purchase_fulfillments set target_type=null,target_id=null where entitlement_id='600'",
        ),
        /recipient cannot change/,
      );
    },
  );

  await t.test(
    "cutoff and entitlement state prevent unsafe historical or inactive preparation",
    async () => {
      const cases = [
        { id: "610", createdAt: "2019-01-01T00:00:00.000Z" },
        { id: "611", deleted: true },
        { id: "612", consumed: true },
        { id: "613", startsAt: "2099-01-01T00:00:00.000Z" },
        { id: "614", endsAt: "2020-01-01T00:00:00.000Z" },
      ];
      for (const row of cases) {
        await record(row.id, row);
        assert.equal(await prepare(row.id, "user", "300"), null);
      }
      await record("615", { guildId: "400" });
      await assert.rejects(
        prepare("615", "user", "301"),
        /does not match entitlement/,
      );
      await assert.rejects(
        prepare("615", "guild", "401"),
        /does not match entitlement/,
      );
      await assert.rejects(prepare("999"), /Entitlement not found/);
      await assert.rejects(
        prepare("601", "guild", null),
        /Invalid fulfillment recipient/,
      );
      await assert.rejects(
        prepare("601", "user", "bad"),
        /Invalid fulfillment recipient/,
      );
      await assert.rejects(
        rpc("monetization_upsert_sku_action", [
          { ...configured, application_id: "999" },
        ]),
        /foreign key/,
      );
      await assert.rejects(
        rpc("monetization_upsert_sku_action", [
          { ...configured, grant_settings: [] },
        ]),
        /check constraint/,
      );
      await db.exec("reset role");
      await assert.rejects(
        db.exec(
          "insert into monetization.purchase_fulfillments(application_id,entitlement_id,sku_id,config_version,action_snapshot) values('999','601','200',1,'{}')",
        ),
        /foreign key/,
      );
      assert.equal(
        (await db.query("select * from monetization.purchase_fulfillments"))
          .rows.length,
        2,
      );
    },
  );

  await t.test(
    "only service RPCs can access private configuration and state",
    async () => {
      for (const role of ["anon", "authenticated"]) {
        await db.exec(`set role ${role}`);
        for (const query of [
          "select public.monetization_get_sku_action('100','200')",
          "select public.monetization_upsert_sku_action('{}')",
          "select public.monetization_create_purchase_fulfillment('100','601')",
          "select public.monetization_get_purchase_fulfillment('100','601')",
        ])
          await assert.rejects(db.query(query), /permission denied/);
      }
      for (const role of ["anon", "authenticated", "service_role"]) {
        await db.exec(`set role ${role}`);
        await assert.rejects(
          db.query("select * from monetization.sku_actions"),
          /permission denied/,
        );
        await assert.rejects(
          db.query("select * from monetization.purchase_fulfillments"),
          /permission denied/,
        );
      }
      assert.equal(
        (await rpc("monetization_get_purchase_fulfillment", [app, "601"]))
          .applied_state,
        "ungranted",
      );
    },
  );
});
