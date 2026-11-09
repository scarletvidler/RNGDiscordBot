import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  assertMonetizationLogin,
  monetizationConnectionConfig,
  createMonetizationModels,
  type EntitlementSnapshot,
  type QueryClient,
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

test("connection configuration cannot override remote TLS or bounded timeouts", () => {
  const remote = monetizationConnectionConfig(
    "postgresql://writer:password@db.example/test?sslmode=require",
  );
  assert.deepEqual(remote.ssl, { rejectUnauthorized: true });
  assert.equal(remote.statement_timeout, 10_000);
  assert.equal(remote.connectionString, undefined);
  assert.equal(
    monetizationConnectionConfig("postgresql://writer:password@localhost/test")
      .ssl,
    false,
  );
  assert.throws(
    () =>
      monetizationConnectionConfig(
        "postgresql://writer:password@localhost/test?host=db.example",
      ),
    /Unsupported/,
  );
  assert.throws(
    () =>
      monetizationConnectionConfig(
        "postgresql://writer:password@db.example/test?sslmode=disable",
      ),
    /Insecure/,
  );
  assert.throws(
    () =>
      monetizationConnectionConfig(
        "postgresql://postgres:password@localhost/test",
      ),
    /dedicated/,
  );
});

test("private PostgreSQL records enforce lifecycle, identities and role boundaries", async (t) => {
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
  await db.exec(
    `insert into monetization.login_applications values (session_user, '${app}');`,
  );
  const client = {
    query: (sql: string, args: unknown[]) => db.query(sql, args),
  } as QueryClient;
  const store = createMonetizationModels(client);
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
      await assert.rejects(
        db.query("select monetization.read_records('payments',$1)", [app]),
        /Invalid record type/,
      );
    },
  );

  await t.test(
    "runtime rejects broad login credentials even when SET ROLE hides them",
    async () => {
      await assert.rejects(
        assertMonetizationLogin(client),
        /restricted writer/,
      );
      await role("monetization_writer");
      await assert.rejects(
        assertMonetizationLogin(client),
        /restricted writer/,
      );
    },
  );

  await t.test(
    "writer cannot read tables or touch unrelated tables",
    async () => {
      await role("monetization_writer");
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
      await assert.rejects(
        store.upsertSkus([
          {
            applicationId: "101",
            id: "200",
            name: "Foreign",
            type: 5,
            flags: 0,
            observedAt: first,
          },
        ]),
        /access denied/,
      );
    },
  );
  await t.test(
    "anonymous/authenticated/service roles inherit no sensitive access",
    async () => {
      for (const name of ["anon", "authenticated", "service_role"]) {
        await role(name);
        await assert.rejects(
          store.applySubscription(subscription),
          /permission denied/,
        );
        await assert.rejects(
          store.listSubscriptions({ applicationId: app }),
          /permission denied/,
        );
        await assert.rejects(
          db.query("select * from monetization.login_applications"),
          /permission denied/,
        );
      }
    },
  );
  await t.test(
    "entitlement before subscription links later; unknown user retained without fake profile",
    async () => {
      await role("monetization_writer");
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
      await role("monetization_writer");
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
      await role("monetization_writer");
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
      await role("monetization_writer");
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
      await role("monetization_reader");
      assert(
        (await store.listSubscriptions({ applicationId: app })).every(
          (row) => row.discord_user_id === "300",
        ),
      );
      await assert.rejects(
        store.applySubscription(subscription),
        /permission denied/,
      );
    },
  );

  await t.test(
    "deletion tombstones survive later create snapshots",
    async () => {
      await role("monetization_writer");
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

test("financial cleanup preserves existing subscriptions, one-time purchases and SKU history", async (t) => {
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
  const store = createMonetizationModels({
    query: (sql: string, args: unknown[]) => db.query(sql, args),
  } as QueryClient);
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
