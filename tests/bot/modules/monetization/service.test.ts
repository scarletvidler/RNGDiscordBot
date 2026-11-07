import assert from "node:assert/strict";
import { test } from "node:test";
import { MonetizationService, type DiscordMonetizationApi } from "../../../../bot/modules/monetization/service.ts";
import { readMonetizationConfig } from "../../../../bot/modules/monetization/config.ts";
import type { EntitlementSnapshot, MonetizationStore, SubscriptionSnapshot } from "../../../../supabase/models/monetization.ts";

const app = "123456789012345678";
const sku = "223456789012345678";
const subSku = "323456789012345678";
const user = "423456789012345678";
const entitlementId = "523456789012345678";
const subscriptionId = "623456789012345678";
const observedAt = "2026-11-07T12:00:00.000Z";
const entitlement = (extra = {}) => ({ id: entitlementId, sku_id: sku, application_id: app,
  user_id: user, type: 1, deleted: false, starts_at: null, ends_at: null, consumed: false, ...extra });
const subscription = (extra = {}) => ({ id: subscriptionId, user_id: user, sku_ids: [subSku],
  entitlement_ids: [], renewal_sku_ids: null, status: 0,
  current_period_start: "2026-11-01T00:00:00.000Z", current_period_end: "2026-12-01T00:00:00.000Z", canceled_at: null, ...extra });

function setup(overrides: Partial<DiscordMonetizationApi> = {}, storeOverrides: Partial<MonetizationStore> = {}) {
  const entitlements: EntitlementSnapshot[] = [];
  const subscriptions: SubscriptionSnapshot[] = [];
  const store: MonetizationStore = {
    upsertSkus: async () => undefined,
    applyEntitlement: async (value) => { entitlements.push(value); },
    applySubscription: async (value) => { subscriptions.push(value); },
    listKnownPurchasers: async () => [], listKnownSubscriptions: async () => [], ...storeOverrides,
  };
  const api: DiscordMonetizationApi = {
    listSkus: async () => [
      { id: sku, application_id: app, name: "A purchase", type: 2, flags: 4 },
      { id: subSku, application_id: app, name: "A subscription", type: 5, flags: 128 },
    ],
    getEntitlement: async () => entitlement(), getSubscription: async () => subscription(),
    listEntitlements: async () => [], listSubscriptions: async () => [], ...overrides,
  };
  const service = new MonetizationService(app, new Set([sku, subSku]), api, store, () => observedAt);
  return { service, entitlements, subscriptions, store, api };
}

test("disabled monetization needs no credentials; enabled configuration fails closed", () => {
  assert.equal(readMonetizationConfig({}), null);
  assert.throws(() => readMonetizationConfig({ DISCORD_MONETIZATION_ENABLED: "true" }));
  assert.throws(() => readMonetizationConfig({ DISCORD_MONETIZATION_ENABLED: "true", DISCORD_MONETIZATION_SKU_IDS: sku }));
  assert.throws(() => readMonetizationConfig({ DISCORD_MONETIZATION_ENABLED: "true", DISCORD_MONETIZATION_SKU_IDS: "-1", DISCORD_MONETIZATION_DATABASE_URL: "present" }));
  assert.equal(readMonetizationConfig({ DISCORD_MONETIZATION_ENABLED: "true", DISCORD_MONETIZATION_SKU_IDS: sku, DISCORD_MONETIZATION_DATABASE_URL: "present" })?.reconcileMs, 3_600_000);
});

test("events canonical-refetch, ignore unconfigured SKUs, and never invent money", async () => {
  let reads = 0;
  const { service, entitlements } = setup({ getEntitlement: async () => { reads++; return entitlement(); } });
  await service.handleEntitlement({ id: entitlementId, skuIds: ["999"] });
  assert.equal(reads, 0);
  await service.handleEntitlement({ id: entitlementId, skuIds: [sku], fallback: entitlement({ consumed: true }) });
  assert.equal(reads, 1);
  assert.equal(entitlements[0].consumed, false);
  assert.equal(entitlements[0].observedAt, observedAt);
  assert.equal("amount" in entitlements[0], false);
  assert.equal("paidAt" in entitlements[0], false);
});

test("rejects foreign application, mismatched ID, malformed ownership and untrusted SKU catalog", async () => {
  for (const invalid of [entitlement({ application_id: "999" }), entitlement({ id: "999" }), entitlement({ user_id: null }), entitlement({ user_id: "attacker" })]) {
    const { service, entitlements } = setup({ getEntitlement: async () => invalid });
    await assert.rejects(service.handleEntitlement({ id: entitlementId, skuIds: [sku] }));
    assert.equal(entitlements.length, 0);
  }
  const { service } = setup({ listSkus: async () => [{ id: sku, application_id: "999", name: "evil", type: 2, flags: 4 }] });
  await assert.rejects(service.handleEntitlement({ id: entitlementId, skuIds: [sku] }));
});

test("stores guild-only beneficiary and gift facts without manufacturing a purchaser", async () => {
  const { service, entitlements } = setup({ getEntitlement: async () => entitlement({ user_id: undefined, guild_id: "723456789012345678", type: 3 }) });
  await service.handleEntitlement({ id: entitlementId, skuIds: [sku] });
  assert.equal(entitlements[0].userId, null);
  assert.equal(entitlements[0].guildId, "723456789012345678");
  assert.equal(entitlements[0].type, 3);
});

test("serializes duplicate events for an ID; independent resources can progress", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let reads = 0;
  const { service, entitlements, subscriptions } = setup({ getEntitlement: async () => {
    reads++;
    if (reads === 1) await gate;
    return entitlement({ consumed: reads > 1 });
  } });
  await service.refreshCatalog();
  const first = service.handleEntitlement({ id: entitlementId, skuIds: [sku] });
  const second = service.handleEntitlement({ id: entitlementId, skuIds: [sku] });
  await service.handleSubscription({ id: subscriptionId, skuIds: [subSku] });
  assert.equal(reads, 1);
  assert.equal(subscriptions.length, 1);
  release();
  await Promise.all([first, second]);
  assert.deepEqual(entitlements.map((value) => value.consumed), [false, true]);
  assert.equal(entitlements[0].id, entitlements[1].id);
});

test("delete events persist authoritative tombstones without REST access", async () => {
  const { service, entitlements, subscriptions } = setup({ getEntitlement: async () => { throw new Error("should not fetch"); }, getSubscription: async () => { throw new Error("should not fetch"); } });
  await service.handleEntitlement({ id: entitlementId, skuIds: [sku], deleted: true, fallback: entitlement() });
  await service.handleSubscription({ id: subscriptionId, skuIds: [subSku], deleted: true, fallback: subscription() });
  assert.equal(entitlements[0].deleted, true);
  assert.equal(subscriptions[0].deleted, true);
});

test("cancellation remains a subscription fact, not deletion or payment", async () => {
  const { service, subscriptions } = setup({ getSubscription: async () => subscription({ status: 2, canceled_at: observedAt }) });
  await service.handleSubscription({ id: subscriptionId, skuIds: [subSku] });
  assert.equal(subscriptions[0].canceledAt, observedAt);
  assert.equal(subscriptions[0].deleted, false);
  assert.equal(subscriptions[0].currentPeriodEnd, "2026-12-01T00:00:00.000Z");
});

test("rejects unconfigured renewal SKU", async () => {
  const { service, subscriptions } = setup({ getSubscription: async () => subscription({ sku_ids: [subSku], renewal_sku_ids: ["999"] }) });
  await assert.rejects(service.handleSubscription({ id: subscriptionId, skuIds: [subSku] }));
  assert.equal(subscriptions.length, 0);
});

test("keeps multi-SKU subscriptions and retries an obsolete SKU hint after upgrades", async () => {
  const nextSku = "823456789012345678";
  const requests: string[] = [];
  const { api, store, subscriptions } = setup({
    listSkus: async () => [subSku, nextSku].map((id) => ({ id, application_id: app, name: "Subscription", type: 5, flags: 128 })),
    getSubscription: async (skuId) => {
      requests.push(skuId);
      if (skuId === subSku) throw { status: 404 };
      return subscription({ sku_ids: [subSku, nextSku] });
    },
  });
  const service = new MonetizationService(app, new Set([subSku, nextSku]), api, store, () => observedAt);
  await service.handleSubscription({ id: subscriptionId, skuIds: [subSku] });
  assert.deepEqual(requests, [subSku, nextSku]);
  assert.deepEqual(subscriptions[0].skuIds, [subSku, nextSku]);
});

test("rejects poison records without blocking later valid rows and surfaces incomplete scan", async () => {
  const { service, entitlements } = setup({ listEntitlements: async () => [
    entitlement({ application_id: "999" }), entitlement({ id: "523456789012345679" }),
  ] });
  await assert.rejects(service.reconcile(), /could not be reconciled/);
  assert.deepEqual(entitlements.map((row) => row.id), ["523456789012345679"]);
});

test("reconciliation paginates and preserves source read time; overlapping scans share work", async () => {
  const cursors: (string | undefined)[] = [];
  const { service, entitlements } = setup({ listEntitlements: async (after) => {
    cursors.push(after);
    return after ? [entitlement({ id: "999456789012345678" })]
      : Array.from({ length: 100 }, (_, n) => entitlement({ id: String(BigInt(entitlementId) + BigInt(n)) }));
  } });
  const a = service.reconcile();
  const b = service.reconcile();
  assert.equal(a, b);
  await a;
  assert.equal(entitlements.length, 101);
  assert.deepEqual(cursors, [undefined, String(BigInt(entitlementId) + 99n)]);
  assert.ok(entitlements.every((row) => row.observedAt === observedAt));
});

test("failed pages never delete known data and subsequent scans can retry", async () => {
  let failure = true;
  const { service, entitlements } = setup({ listEntitlements: async (after) => {
    if (after && failure) throw new Error("temporary failure");
    return after ? [] : Array.from({ length: 100 }, (_, n) => entitlement({ id: String(BigInt(entitlementId) + BigInt(n)) }));
  } });
  await assert.rejects(service.reconcile());
  assert.ok(entitlements.every((row) => !row.deleted));
  failure = false;
  await service.reconcile();
  assert.equal(entitlements.length, 200);
});

test("subscription queries are scoped by known user and known IDs are point-refetched", async () => {
  const queries: string[][] = [];
  const { service, subscriptions } = setup({ listSubscriptions: async (skuId, userId) => { queries.push([skuId, userId]); return [subscription()]; } }, {
    listKnownPurchasers: async () => [user],
    listKnownSubscriptions: async () => [{ id: subscriptionId, userId: user, skuIds: [subSku] }],
  });
  await service.reconcile();
  assert.deepEqual(queries, [[subSku, user]]);
  assert.equal(subscriptions.length, 2);
});

test("unknown-subscription HTTP failure is surfaced without inventing deletion", async () => {
  const { service, subscriptions } = setup({ getSubscription: async () => { throw { status: 404 }; } }, {
    listKnownSubscriptions: async () => [{ id: subscriptionId, userId: user, skuIds: [subSku] }],
  });
  await assert.rejects(service.reconcile());
  assert.equal(subscriptions.length, 0);
});

test("failed writes do not poison per-resource queue; stopping rejects new work", async () => {
  let attempts = 0;
  const { service } = setup({}, { applyEntitlement: async () => { if (++attempts === 1) throw new Error("database unavailable"); } });
  await assert.rejects(service.handleEntitlement({ id: entitlementId, skuIds: [sku] }));
  await service.handleEntitlement({ id: entitlementId, skuIds: [sku] });
  assert.equal(attempts, 2);
  await service.stop();
  await assert.rejects(service.handleEntitlement({ id: entitlementId, skuIds: [sku] }));
});
