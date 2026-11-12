import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  createMonetizationModels,
  type EntitlementSnapshot,
  type MonetizationRpcClient,
  type SubscriptionSnapshot,
} from "../../supabase/models/monetization.ts";

const app = "100";
const first = "2026-11-07T10:00:00.000Z";
const next = "2026-11-07T11:00:00.000Z";
const latest = "2026-11-07T12:00:00.000Z";
const subscription: SubscriptionSnapshot = {
  applicationId: app,
  id: "500",
  userId: "300",
  skuIds: ["200"],
  entitlementIds: ["600"],
  renewalSkuIds: null,
  status: 0,
  currentPeriodStart: first,
  currentPeriodEnd: "2026-12-07T10:00:00.000Z",
  canceledAt: null,
  createdAt: first,
  observedAt: first,
  deleted: false,
};
const entitlement: EntitlementSnapshot = {
  applicationId: app,
  id: "600",
  skuId: "200",
  userId: "300",
  guildId: "400",
  type: 8,
  startsAt: first,
  endsAt: null,
  consumed: false,
  deleted: false,
  createdAt: first,
  observedAt: first,
};

function rpcClient(db: PGlite, legacy = false): MonetizationRpcClient {
  return {
    async rpc(name, args) {
      const values = Object.values(args).map((value) =>
        typeof value === "object" && value !== null
          ? JSON.stringify(value)
          : value,
      );
      const target = legacy
        ? "monetization." + name.replace(/^monetization_/, "")
        : "public." + name;
      const placeholders = values.map((_, i) => "$" + (i + 1)).join(",");
      const result = await db.query<{ result: unknown }>(
        "select " + target + "(" + placeholders + ") as result",
        values,
      );
      return { data: result.rows[0]?.result, error: null };
    },
  };
}

async function applySharedConnectionMigration(db: PGlite): Promise<void> {
  await db.exec(
    await readFile(
      new URL(
        "../../supabase/migrations/20261112000000_shared_supabase_monetization.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
}

test("shared Supabase RPCs enforce lifecycle, identities and role boundaries", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(
    "create role anon; create role authenticated; create role service_role; create table public.discord_users(id text primary key, username text not null); alter default privileges grant execute on functions to anon, authenticated, service_role;",
  );
  await db.exec(
    await readFile(
      new URL(
        "../../supabase/migrations/20261107000000_discord_monetization_records.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(
    await readFile(
      new URL(
        "../../supabase/migrations/20261107010000_remove_monetization_financial_records.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await applySharedConnectionMigration(db);
  const store = createMonetizationModels(rpcClient(db));
  async function role(name: string): Promise<void> {
    await db.exec(`set role ${name}`);
  }
  async function admin(): Promise<void> {
    await db.exec("reset role");
  }

  await t.test(
    "final schema has no financial tables, columns, functions or role",
    async () => {
      const tables = await db.query<{ name: string }>(
        "select tablename name from pg_tables where schemaname='monetization'",
      );
      assert(
        !tables.rows.some((row) =>
          ["payments", "payment_items"].includes(row.name),
        ),
      );
      const columns = await db.query<{ name: string }>(
        "select column_name name from information_schema.columns where table_schema='monetization'",
      );
      assert(
        !columns.rows.some((row) =>
          ["amount_minor", "currency", "latest_payment_at"].includes(row.name),
        ),
      );
      assert.equal(
        (
          await db.query(
            "select from pg_roles where rolname='monetization_finance'",
          )
        ).rows.length,
        0,
      );
      assert.equal(
        (
          await db.query(
            "select from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='monetization' and p.proname='record_verified_payment'",
          )
        ).rows.length,
        0,
      );
      assert.equal(
        (
          await db.query(
            "select from pg_roles where rolname in ('monetization_writer','monetization_reader')",
          )
        ).rows.length,
        0,
      );
      assert.equal(
        (
          await db.query<{ name: string | null }>(
            "select to_regclass('monetization.login_applications') as name",
          )
        ).rows[0].name,
        null,
      );
      await role("service_role");
      await assert.rejects(
        db.query("select public.monetization_read_records('payments',$1)", [
          app,
        ]),
        /Invalid record type/,
      );
    },
  );

  await t.test(
    "service credential uses wrappers without direct private table access or login binding",
    async () => {
      await role("service_role");
      await assert.rejects(
        db.query("select * from monetization.subscriptions"),
        /permission denied/,
      );
      await assert.rejects(
        db.query("insert into public.discord_users values ('999','malicious')"),
        /permission denied/,
      );
      await store.upsertSkus([
        {
          applicationId: app,
          id: "200",
          name: "Supporter",
          type: 5,
          flags: 128,
          observedAt: first,
        },
        {
          applicationId: app,
          id: "201",
          name: "Plus",
          type: 5,
          flags: 128,
          observedAt: first,
        },
        {
          applicationId: app,
          id: "202",
          name: "Voice pack",
          type: 2,
          flags: 4,
          observedAt: first,
        },
        {
          applicationId: app,
          id: "203",
          name: "Tokens",
          type: 3,
          flags: 4,
          observedAt: first,
        },
      ]);
    },
  );
  await t.test(
    "anonymous and authenticated roles cannot execute any monetization RPC",
    async () => {
      for (const name of ["anon", "authenticated"]) {
        await role(name);
        for (const sql of [
          "select public.monetization_upsert_skus('[]'::jsonb)",
          "select public.monetization_apply_subscription('{}'::jsonb)",
          "select public.monetization_apply_entitlement('{}'::jsonb)",
          "select public.monetization_known_purchasers('100')",
          "select public.monetization_read_records('subscriptions','100')",
        ])
          await assert.rejects(db.query(sql), /permission denied/);

        await assert.rejects(
          store.applySubscription(subscription),
          /permission denied/,
        );
        await assert.rejects(
          store.listSubscriptions({ applicationId: app }),
          /permission denied/,
        );
        await assert.rejects(
          db.query("select * from monetization.subscriptions"),
          /permission denied/,
        );
      }
    },
  );
  await t.test(
    "entitlement before subscription links later; unknown user retained without fake profile",
    async () => {
      await role("service_role");
      await store.applyEntitlement(entitlement);
      assert.deepEqual(await store.listKnownPurchasers(app), ["300"]);
      await store.applySubscription(subscription);
      const records = await store.listSubscriptions({
        applicationId: app,
        guildId: "400",
      });
      assert.equal(records.length, 1);
      assert.equal(records[0].discord_user_id, null);
      assert(!("amount_minor" in records[0]));
      assert(!("currency" in records[0]));
      assert.deepEqual(records[0].items, [
        { sku_id: "200", title: "Supporter", is_current: true },
      ]);
    },
  );
  await t.test(
    "replay and stale snapshots do not revert updates; titles and historical SKUs remain",
    async () => {
      await role("service_role");
      await store.applySubscription({
        ...subscription,
        skuIds: ["201"],
        observedAt: next,
        status: 1,
      });
      await store.applySubscription(subscription);
      await store.applySubscription(subscription);
      const [row] = await store.listSubscriptions({
        applicationId: app,
        userId: "300",
      });
      assert.equal(row.status, 1);
      assert.equal(row.title, "Supporter");
      assert.deepEqual(row.items, [
        { sku_id: "200", title: "Supporter", is_current: false },
        { sku_id: "201", title: "Plus", is_current: true },
      ]);
      await assert.rejects(
        store.applySubscription({
          ...subscription,
          userId: "301",
          observedAt: latest,
        }),
        /purchaser cannot change/,
      );
    },
  );
  await t.test(
    "OTP retains beneficiary while gifts have no inferred purchaser; consumed state is monotonic",
    async () => {
      await role("service_role");
      await store.applyEntitlement({
        ...entitlement,
        id: "700",
        skuId: "202",
        type: 1,
      });
      await store.applyEntitlement({
        ...entitlement,
        id: "701",
        skuId: "203",
        type: 6,
      });
      await store.applyEntitlement({
        ...entitlement,
        id: "701",
        skuId: "203",
        type: 6,
        consumed: true,
        observedAt: next,
      });
      await store.applyEntitlement({
        ...entitlement,
        id: "701",
        skuId: "203",
        type: 6,
        consumed: false,
        observedAt: latest,
      });
      const records = await store.listOneTimePurchases({
        applicationId: app,
        guildId: "400",
      });
      assert.equal(records[0].purchaser_discord_id, "300");
      assert.equal(records[1].purchaser_discord_id, null);
      assert.equal(records[1].consumed, true);
      await assert.rejects(
        store.applyEntitlement({
          ...entitlement,
          id: "700",
          skuId: "202",
          type: 1,
          userId: "301",
          observedAt: latest,
        }),
        /identity cannot change/,
      );
    },
  );

  await t.test(
    "late profile links populate without inventing identity, including guild-only entitlement links",
    async () => {
      await role("service_role");
      await store.applyEntitlement({ ...entitlement, id: "601", userId: null });
      await store.applySubscription({
        ...subscription,
        id: "501",
        entitlementIds: ["601"],
      });
      await store.applySubscription({
        ...subscription,
        id: "502",
        entitlementIds: ["602"],
      });
      await store.applyEntitlement({ ...entitlement, id: "602", userId: null });
      assert.equal(
        (await store.listSubscriptions({ applicationId: app, guildId: "400" }))
          .length,
        3,
      );
      await admin();
      await db.exec(
        "insert into public.discord_users values ('300','KnownUser')",
      );
      await role("service_role");
      assert(
        (await store.listSubscriptions({ applicationId: app })).every(
          (row) => row.discord_user_id === "300",
        ),
      );
    },
  );

  await t.test(
    "deletion tombstones survive later create snapshots",
    async () => {
      await role("service_role");
      await store.applySubscription({
        ...subscription,
        observedAt: first,
        deleted: true,
      });
      await store.applySubscription({
        ...subscription,
        observedAt: "2026-11-07T13:00:00.000Z",
        deleted: false,
      });
      await store.applyEntitlement({
        ...entitlement,
        observedAt: first,
        deleted: true,
      });
      await store.applyEntitlement({ ...entitlement, observedAt: latest });
      assert.equal(
        (await store.listSubscriptions({ applicationId: app }))[0].deleted,
        true,
      );
      await admin();
      assert.equal(
        (
          await db.query<{ deleted: boolean }>(
            "select deleted from monetization.entitlements where id='600'",
          )
        ).rows[0].deleted,
        true,
      );
    },
  );
});

test("financial cleanup and shared-connection migration preserve existing subscriptions, purchases and SKU history", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(
    "create role anon; create role authenticated; create role service_role; create table public.discord_users(id text primary key, username text not null);",
  );
  await db.exec(
    await readFile(
      new URL(
        "../../supabase/migrations/20261107000000_discord_monetization_records.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(
    "insert into monetization.login_applications values (session_user, '100');",
  );
  let store = createMonetizationModels(rpcClient(db, true));
  await store.upsertSkus([
    {
      applicationId: app,
      id: "200",
      name: "Supporter",
      type: 5,
      flags: 0,
      observedAt: first,
    },
    {
      applicationId: app,
      id: "202",
      name: "Voice pack",
      type: 2,
      flags: 0,
      observedAt: first,
    },
  ]);
  await store.applySubscription(subscription);
  await store.applyEntitlement({
    ...entitlement,
    id: "700",
    skuId: "202",
    type: 1,
  });
  await db.exec(
    "update monetization.subscriptions set amount_minor=999,currency='GBP'; insert into monetization.payments(application_id,source,source_payment_id,subscription_id,purchaser_discord_id,title,status,verified_at,source_reference) values ('100','old-import','txn','500','300','Supporter','paid',now(),'row');",
  );
  await db.exec(
    await readFile(
      new URL(
        "../../supabase/migrations/20261107010000_remove_monetization_financial_records.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await applySharedConnectionMigration(db);
  await db.exec("set role service_role");
  store = createMonetizationModels(rpcClient(db));
  const [sub] = await store.listSubscriptions({ applicationId: app });
  const [purchase] = await store.listOneTimePurchases({ applicationId: app });
  assert.equal(sub.id, "500");
  assert.equal(sub.title, "Supporter");
  assert.deepEqual(sub.items, [
    { sku_id: "200", title: "Supporter", is_current: true },
  ]);
  assert.equal(purchase.id, "700");
  assert.equal(purchase.purchaser_discord_id, "300");
  assert.equal(purchase.guild_id, "400");
  assert(!("amount_minor" in sub));
  assert(!("currency" in purchase));
  await store.applySubscription({
    ...subscription,
    status: 1,
    observedAt: next,
  });
  assert.equal(
    (await store.listSubscriptions({ applicationId: app }))[0].status,
    1,
  );
});
