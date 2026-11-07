import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { assertMonetizationLogin, monetizationConnectionConfig, createFinancialImporter, createMonetizationModels, validatePayment, type EntitlementSnapshot, type QueryClient, type SubscriptionSnapshot, type VerifiedPayment } from "../../supabase/models/monetization.ts";

const app = "100";
const first = "2026-11-07T10:00:00.000Z";
const next = "2026-11-07T11:00:00.000Z";
const latest = "2026-11-07T12:00:00.000Z";
const subscription: SubscriptionSnapshot = { applicationId: app, id: "500", userId: "300", skuIds: ["200"], entitlementIds: ["600"], renewalSkuIds: null, status: 0, currentPeriodStart: first, currentPeriodEnd: "2026-12-07T10:00:00.000Z", canceledAt: null, createdAt: first, observedAt: first, deleted: false };
const entitlement: EntitlementSnapshot = { applicationId: app, id: "600", skuId: "200", userId: "300", guildId: "400", type: 8, startsAt: first, endsAt: null, consumed: false, deleted: false, createdAt: first, observedAt: first };
const payment: VerifiedPayment = { applicationId: app, source: "verified-export", sourcePaymentId: "txn-1", subscriptionId: "500", oneTimePurchaseId: null, purchaserDiscordId: "300", title: "Supporter", amountMinor: "999", currency: "GBP", paidAt: first, status: "paid", verifiedAt: first, sourceReference: "export-row-1", items: [{ skuId: "200", title: "Supporter" }] };

test("financial model rejects ambiguous parents and invalid or imprecise money", () => {
  validatePayment(payment);
  assert.throws(() => validatePayment({ ...payment, oneTimePurchaseId: "700" }), /exactly one/);
  assert.throws(() => validatePayment({ ...payment, subscriptionId: null }), /exactly one/);
  assert.throws(() => validatePayment({ ...payment, amountMinor: "9.99" }), /minor-unit/);
  assert.throws(() => validatePayment({ ...payment, amountMinor: "9223372036854775808" }), /minor-unit/);
  assert.throws(() => validatePayment({ ...payment, currency: null }), /known together/);
  assert.throws(() => validatePayment({ ...payment, items: [] }), /SKU items/);
});

test("connection configuration cannot override remote TLS or bounded timeouts", () => {
  const remote = monetizationConnectionConfig("postgresql://writer:password@db.example/test?sslmode=require");
  assert.deepEqual(remote.ssl, { rejectUnauthorized: true });
  assert.equal(remote.statement_timeout, 10_000);
  assert.equal(remote.connectionString, undefined);
  assert.equal(monetizationConnectionConfig("postgresql://writer:password@localhost/test").ssl, false);
  assert.throws(() => monetizationConnectionConfig("postgresql://writer:password@localhost/test?host=db.example"), /Unsupported/);
  assert.throws(() => monetizationConnectionConfig("postgresql://writer:password@db.example/test?sslmode=disable"), /Insecure/);
  assert.throws(() => monetizationConnectionConfig("postgresql://postgres:password@localhost/test"), /dedicated/);
});

test("private PostgreSQL records enforce lifecycle, identities, finance and role boundaries", async t => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec("create role anon; create role authenticated; create role service_role; create table public.discord_users(id text primary key, username text not null); alter default privileges grant execute on functions to anon, authenticated, service_role;");
  await db.exec(await readFile(new URL("../../supabase/migrations/20261107000000_discord_monetization_records.sql", import.meta.url), "utf8"));
  await db.exec(`insert into monetization.login_applications values (session_user, '${app}');`);
  const client = { query: (sql: string, args: unknown[]) => db.query(sql, args) } as QueryClient;
  const store = createMonetizationModels(client);
  const finance = createFinancialImporter(client);
  async function role(name: string): Promise<void> { await db.exec(`set role ${name}`); }
  async function admin(): Promise<void> { await db.exec("reset role"); }
  async function count(table: string): Promise<number> { await admin(); const result = await db.query<{ count: number }>(`select count(*)::int count from monetization.${table}`); return result.rows[0].count; }

  await t.test("runtime rejects broad login credentials even when SET ROLE hides them", async () => {
    await assert.rejects(assertMonetizationLogin(client), /restricted writer/);
    await role("monetization_writer");
    await assert.rejects(assertMonetizationLogin(client), /restricted writer/);
  });

  await t.test("writer cannot read tables, finance-import, or touch unrelated tables", async () => {
    await role("monetization_writer");
    await assert.rejects(db.query("select * from monetization.payments"), /permission denied/);
    await assert.rejects(db.query("insert into public.discord_users values ('999','malicious')"), /permission denied/);
    await assert.rejects(finance.recordVerifiedPayment(payment), /permission denied/);
    await store.upsertSkus([
      { applicationId: app, id: "200", name: "Supporter", type: 5, flags: 128, observedAt: first },
      { applicationId: app, id: "201", name: "Plus", type: 5, flags: 128, observedAt: first },
      { applicationId: app, id: "202", name: "Voice pack", type: 2, flags: 4, observedAt: first },
      { applicationId: app, id: "203", name: "Tokens", type: 3, flags: 4, observedAt: first },
    ]);
    await assert.rejects(store.upsertSkus([{ applicationId: "101", id: "200", name: "Foreign", type: 5, flags: 0, observedAt: first }]), /access denied/);
  });
  await t.test("anonymous/authenticated/service roles inherit no sensitive access", async () => {
    for (const name of ["anon", "authenticated", "service_role"]) {
      await role(name);
      await assert.rejects(store.applySubscription(subscription), /permission denied/);
      await assert.rejects(store.listSubscriptions({ applicationId: app }), /permission denied/);
      await assert.rejects(db.query("select * from monetization.login_applications"), /permission denied/);
    }
  });
  await t.test("entitlement before subscription links later; unknown user retained without fake profile", async () => {
    await role("monetization_writer");
    await store.applyEntitlement(entitlement);
    assert.deepEqual(await store.listKnownPurchasers(app), ["300"]);
    await store.applySubscription(subscription);
    const records = await store.listSubscriptions({ applicationId: app, guildId: "400" });
    assert.equal(records.length, 1);
    assert.equal(records[0].discord_user_id, null);
    assert.equal(records[0].amount_minor, null);
    assert.deepEqual(records[0].items, [{ sku_id: "200", title: "Supporter", is_current: true }]);
    assert.equal(await count("payments"), 0);
  });
  await t.test("replay and stale snapshots do not revert updates; titles and historical SKUs remain", async () => {
    await role("monetization_writer");
    await store.applySubscription({ ...subscription, skuIds: ["201"], observedAt: next, status: 1 });
    await store.applySubscription(subscription);
    await store.applySubscription(subscription);
    const [row] = await store.listSubscriptions({ applicationId: app, userId: "300" });
    assert.equal(row.status, 1);
    assert.equal(row.title, "Supporter");
    assert.deepEqual(row.items, [{ sku_id: "200", title: "Supporter", is_current: false }, { sku_id: "201", title: "Plus", is_current: true }]);
    await assert.rejects(store.applySubscription({ ...subscription, userId: "301", observedAt: latest }), /purchaser cannot change/);
  });
  await t.test("OTP retains beneficiary while gifts have no inferred purchaser; consumed state is monotonic", async () => {
    await role("monetization_writer");
    await store.applyEntitlement({ ...entitlement, id: "700", skuId: "202", type: 1 });
    await store.applyEntitlement({ ...entitlement, id: "701", skuId: "203", type: 6 });
    await store.applyEntitlement({ ...entitlement, id: "701", skuId: "203", type: 6, consumed: true, observedAt: next });
    await store.applyEntitlement({ ...entitlement, id: "701", skuId: "203", type: 6, consumed: false, observedAt: latest });
    const records = await store.listOneTimePurchases({ applicationId: app, guildId: "400" });
    assert.equal(records[0].purchaser_discord_id, "300");
    assert.equal(records[1].purchaser_discord_id, null);
    assert.equal(records[1].consumed, true);
    await assert.rejects(store.applyEntitlement({ ...entitlement, id: "700", skuId: "202", type: 1, userId: "301", observedAt: latest }), /identity cannot change/);
  });
  await t.test("verified payment imports have historical SKU validation, integer precision and replay protection", async () => {
    await role("monetization_finance");
    await finance.recordVerifiedPayment(payment);
    await finance.recordVerifiedPayment(payment);
    await assert.rejects(finance.recordVerifiedPayment({ ...payment, sourcePaymentId: "bad-parent", purchaserDiscordId: "301" }), /does not match/);
    await assert.rejects(finance.recordVerifiedPayment({ ...payment, sourcePaymentId: "bad-sku", items: [{ skuId: "202", title: "Wrong" }] }), /SKU does not match/);
    await assert.rejects(finance.recordVerifiedPayment({ ...payment, amountMinor: "1000", verifiedAt: next }), /Immutable/);
    await finance.recordVerifiedPayment({ ...payment, sourcePaymentId: "txn-2", paidAt: next, verifiedAt: next, amountMinor: "9007199254740993" });
    await finance.recordVerifiedPayment({ ...payment, sourcePaymentId: "txn-old", paidAt: "2026-11-06T10:00:00.000Z", verifiedAt: latest, amountMinor: "200" });
    const records = await store.listPayments({ applicationId: app, userId: "300" });
    assert.equal(records.length, 3);
    assert(records.some(row => row.amount_minor === "9007199254740993"));
    assert(records.every(row => row.items[0].sku_id === "200"));
    assert.equal((await store.listSubscriptions({ applicationId: app }))[0].amount_minor, "9007199254740993");
  });
  await t.test("SQL itself rejects ambiguous parents and unauthorized financial mutation", async () => {
    await role("monetization_finance");
    await assert.rejects(db.query("select monetization.record_verified_payment($1::jsonb)", [JSON.stringify({ ...payment, oneTimePurchaseId: "700" })]), /exactly one/);
    await assert.rejects(db.query("select monetization.record_verified_payment($1::jsonb)", [JSON.stringify({ ...payment, sourcePaymentId: "bad-currency", currency: null })]), /check constraint/);
    await assert.rejects(db.query("delete from monetization.payments"), /permission denied/);
    for (const items of [undefined, null]) {
      await assert.rejects(db.query("select monetization.record_verified_payment($1::jsonb)", [JSON.stringify({ ...payment, sourcePaymentId: "missing-items", items })]), /requires SKU items/);
    }
    await assert.rejects(db.query("select monetization.read_records('payments',$1,null,null,null,null)", [app]), /Invalid page size/);
  });
  await t.test("verified unknown money can be enriched once, conflicting retries and item titles are rejected", async () => {
    await role("monetization_finance");
    const unknown = { ...payment, sourcePaymentId: "txn-unknown", amountMinor: null, currency: null, paidAt: null };
    await finance.recordVerifiedPayment(unknown);
    await finance.recordVerifiedPayment({ ...payment, sourcePaymentId: unknown.sourcePaymentId, verifiedAt: next });
    await assert.rejects(finance.recordVerifiedPayment({ ...unknown, verifiedAt: latest }), /Immutable/);
    await assert.rejects(finance.recordVerifiedPayment({ ...payment, items: [{ skuId: "200", title: "Conflicting title" }], verifiedAt: latest }), /Immutable payment items/);
    await finance.recordVerifiedPayment({ ...payment, status: "refunded", verifiedAt: next });
    await assert.rejects(finance.recordVerifiedPayment({ ...payment, verifiedAt: latest }), /Refund state cannot regress/);
  });
  await t.test("late profile links populate without inventing identity, including guild-only entitlement links", async () => {
    await role("monetization_writer");
    await store.applyEntitlement({ ...entitlement, id: "601", userId: null });
    await store.applySubscription({ ...subscription, id: "501", entitlementIds: ["601"] });
    await store.applySubscription({ ...subscription, id: "502", entitlementIds: ["602"] });
    await store.applyEntitlement({ ...entitlement, id: "602", userId: null });
    assert.equal((await store.listSubscriptions({ applicationId: app, guildId: "400" })).length, 3);
    await admin();
    await db.exec("insert into public.discord_users values ('300','KnownUser')");
    await role("monetization_reader");
    assert((await store.listSubscriptions({ applicationId: app })).every(row => row.discord_user_id === "300"));
    await assert.rejects(store.applySubscription(subscription), /permission denied/);
  });
  await t.test("OTP historical import cannot regress last paid summary or overwrite established purchaser", async () => {
    await role("monetization_finance");
    const gift = { ...payment, subscriptionId: null, oneTimePurchaseId: "701", sourcePaymentId: "gift-new", purchaserDiscordId: "301", amountMinor: "500", paidAt: next, items: [{ skuId: "203", title: "Tokens" }] };
    await finance.recordVerifiedPayment(gift);
    await finance.recordVerifiedPayment({ ...gift, sourcePaymentId: "gift-old", amountMinor: "100", paidAt: first, verifiedAt: latest });
    await assert.rejects(finance.recordVerifiedPayment({ ...gift, sourcePaymentId: "gift-other-owner", purchaserDiscordId: "302" }), /does not match/);
    const row = (await store.listOneTimePurchases({ applicationId: app, userId: "301" }))[0];
    assert.equal(row.amount_minor, "500");
    assert.equal(row.beneficiary_discord_id, "300");
  });
  await t.test("deletion tombstones survive later create snapshots and payments remain", async () => {
    await role("monetization_writer");
    await store.applySubscription({ ...subscription, observedAt: first, deleted: true });
    await store.applySubscription({ ...subscription, observedAt: "2026-11-07T13:00:00.000Z", deleted: false });
    await store.applyEntitlement({ ...entitlement, observedAt: first, deleted: true });
    await store.applyEntitlement({ ...entitlement, observedAt: latest });
    assert.equal((await store.listSubscriptions({ applicationId: app }))[0].deleted, true);
    await admin();
    assert.equal((await db.query<{ deleted: boolean }>("select deleted from monetization.entitlements where id='600'")).rows[0].deleted, true);
    assert.equal(await count("payments"), 6);
    await role("monetization_writer");
    assert(!(await store.listKnownSubscriptions(app)).some(row => row.id === "500"));
  });
});
