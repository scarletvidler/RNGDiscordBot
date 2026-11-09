import assert from "node:assert/strict";
import { after, test } from "node:test";
import { keyedQueue } from "../../../../bot/helpers/keyedQueue.ts";
import {
  MonetizationService,
  type DiscordMonetizationApi,
} from "../../../../bot/modules/monetization/service.ts";
import { readMonetizationConfig } from "../../../../bot/modules/monetization/config.ts";
import type {
  EntitlementSnapshot,
  MonetizationStore,
  SubscriptionSnapshot,
} from "../../../../supabase/models/monetization.ts";

keyedQueue.start();
after(() => keyedQueue.stop());

const app = "123456789012345678";
const sku = "223456789012345678";
const subSku = "323456789012345678";
const user = "423456789012345678";
const entitlementId = "523456789012345678";
const subscriptionId = "623456789012345678";
const observedAt = "2026-11-07T12:00:00.000Z";
const entitlement = (extra = {}) => ({
  id: entitlementId,
  sku_id: sku,
  application_id: app,
  user_id: user,
  type: 1,
  deleted: false,
  starts_at: null,
  ends_at: null,
  consumed: false,
  ...extra,
});
const subscription = (extra = {}) => ({
  id: subscriptionId,
  user_id: user,
  sku_ids: [subSku],
  entitlement_ids: [],
  renewal_sku_ids: null,
  status: 0,
  current_period_start: "2026-11-01T00:00:00.000Z",
  current_period_end: "2026-12-01T00:00:00.000Z",
  canceled_at: null,
  ...extra,
});

function setup(
  overrides: Partial<DiscordMonetizationApi> = {},
  storeOverrides: Partial<MonetizationStore> = {},
) {
  const entitlements: EntitlementSnapshot[] = [];
  const subscriptions: SubscriptionSnapshot[] = [];
  const store: MonetizationStore = {
    upsertSkus: async () => undefined,
    applyEntitlement: async (value) => {
      entitlements.push(value);
    },
    applySubscription: async (value) => {
      subscriptions.push(value);
    },
    listKnownPurchasers: async () => [],
    ...storeOverrides,
  };
  const api: DiscordMonetizationApi = {
    listSkus: async () => [
      { id: sku, application_id: app, name: "A purchase", type: 2, flags: 4 },
      {
        id: subSku,
        application_id: app,
        name: "A subscription",
        type: 5,
        flags: 128,
      },
    ],
    listEntitlements: async () => [],
    listSubscriptions: async () => [],
    ...overrides,
  };
  const service = new MonetizationService(
    app,
    new Set([sku, subSku]),
    api,
    store,
    () => observedAt,
  );
  return { service, entitlements, subscriptions, store, api };
}

test("disabled monetization needs no credentials; enabled configuration fails closed", () => {
  assert.equal(readMonetizationConfig({}), null);
  assert.throws(() =>
    readMonetizationConfig({ DISCORD_MONETIZATION_ENABLED: "true" }),
  );
  assert.throws(() =>
    readMonetizationConfig({
      DISCORD_MONETIZATION_ENABLED: "true",
      DISCORD_MONETIZATION_SKU_IDS: sku,
    }),
  );
  assert.throws(() =>
    readMonetizationConfig({
      DISCORD_MONETIZATION_ENABLED: "true",
      DISCORD_MONETIZATION_SKU_IDS: "-1",
      DISCORD_MONETIZATION_DATABASE_URL: "present",
    }),
  );
  assert.equal(
    readMonetizationConfig({
      DISCORD_MONETIZATION_ENABLED: "true",
      DISCORD_MONETIZATION_SKU_IDS: sku,
      DISCORD_MONETIZATION_DATABASE_URL: "present",
    })?.reconcileMs,
    3_600_000,
  );
});

test("events use their Discord payload directly without resource verification requests", async () => {
  const { service, entitlements, subscriptions, api } = setup();
  await service.refreshCatalog();
  api.listSkus =
    api.listEntitlements =
    api.listSubscriptions =
      async () => {
        throw new Error("Unexpected REST request");
      };
  await service.handleEntitlement({
    id: entitlementId,
    skuIds: ["999"],
    payload: entitlement(),
  });
  assert.equal(entitlements.length, 0);
  await service.handleEntitlement({
    id: entitlementId,
    skuIds: [sku],
    payload: entitlement({ consumed: true }),
  });
  await service.handleSubscription({
    id: subscriptionId,
    skuIds: [subSku],
    payload: subscription(),
  });
  assert.equal(entitlements[0].consumed, true);
  assert.equal(entitlements[0].observedAt, observedAt);
  assert.equal(subscriptions[0].id, subscriptionId);
});

test("rejects foreign application, mismatched ID, malformed ownership and foreign SKU catalog", async () => {
  for (const invalid of [
    entitlement({ application_id: "999" }),
    entitlement({ id: "999" }),
    entitlement({ user_id: null }),
    entitlement({ user_id: "attacker" }),
  ]) {
    const { service, entitlements } = setup();
    await assert.rejects(
      service.handleEntitlement({
        id: entitlementId,
        skuIds: [sku],
        payload: invalid,
      }),
    );
    assert.equal(entitlements.length, 0);
  }
  const { service } = setup({
    listSkus: async () => [
      { id: sku, application_id: "999", name: "evil", type: 2, flags: 4 },
    ],
  });
  await assert.rejects(
    service.handleEntitlement({
      id: entitlementId,
      skuIds: [sku],
      payload: entitlement(),
    }),
  );
});

test("stores guild-only beneficiary and gift facts without manufacturing a purchaser", async () => {
  const { service, entitlements } = setup();
  await service.handleEntitlement({
    id: entitlementId,
    skuIds: [sku],
    payload: entitlement({
      user_id: undefined,
      guild_id: "723456789012345678",
      type: 3,
    }),
  });
  assert.equal(entitlements[0].userId, null);
  assert.equal(entitlements[0].guildId, "723456789012345678");
  assert.equal(entitlements[0].type, 3);
});

test("serializes duplicate events for an ID; independent resources can progress", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let writes = 0;
  const persisted: EntitlementSnapshot[] = [];
  const { service, subscriptions } = setup(
    {},
    {
      applyEntitlement: async (value) => {
        if (++writes === 1) await gate;
        persisted.push(value);
      },
    },
  );
  await service.refreshCatalog();
  const first = service.handleEntitlement({
    id: entitlementId,
    skuIds: [sku],
    payload: entitlement(),
  });
  const second = service.handleEntitlement({
    id: entitlementId,
    skuIds: [sku],
    payload: entitlement({ consumed: true }),
  });
  await service.handleSubscription({
    id: subscriptionId,
    skuIds: [subSku],
    payload: subscription(),
  });
  assert.equal(writes, 1);
  assert.equal(subscriptions.length, 1);
  release();
  await Promise.all([first, second]);
  assert.deepEqual(
    persisted.map((value) => value.consumed),
    [false, true],
  );
  assert.equal(persisted[0].id, persisted[1].id);
});

test("delete events persist authoritative tombstones", async () => {
  const { service, entitlements, subscriptions } = setup();
  await service.handleEntitlement({
    id: entitlementId,
    skuIds: [sku],
    deleted: true,
    payload: entitlement(),
  });
  await service.handleSubscription({
    id: subscriptionId,
    skuIds: [subSku],
    deleted: true,
    payload: subscription(),
  });
  assert.equal(entitlements[0].deleted, true);
  assert.equal(subscriptions[0].deleted, true);
});

test("cancellation preserves subscription period without becoming deletion", async () => {
  const { service, subscriptions } = setup();
  await service.handleSubscription({
    id: subscriptionId,
    skuIds: [subSku],
    payload: subscription({ status: 2, canceled_at: observedAt }),
  });
  assert.equal(subscriptions[0].canceledAt, observedAt);
  assert.equal(subscriptions[0].deleted, false);
  assert.equal(subscriptions[0].currentPeriodEnd, "2026-12-01T00:00:00.000Z");
});

test("rejects unconfigured renewal SKU", async () => {
  const { service, subscriptions } = setup();
  await assert.rejects(
    service.handleSubscription({
      id: subscriptionId,
      skuIds: [subSku],
      payload: subscription({ renewal_sku_ids: ["999"] }),
    }),
  );
  assert.equal(subscriptions.length, 0);
});

test("keeps multi-SKU subscriptions directly from the event", async () => {
  const nextSku = "823456789012345678";
  const { api, store, subscriptions } = setup({
    listSkus: async () =>
      [subSku, nextSku].map((id) => ({
        id,
        application_id: app,
        name: "Subscription",
        type: 5,
        flags: 128,
      })),
  });
  const service = new MonetizationService(
    app,
    new Set([subSku, nextSku]),
    api,
    store,
    () => observedAt,
  );
  await service.handleSubscription({
    id: subscriptionId,
    skuIds: [subSku, nextSku],
    payload: subscription({ sku_ids: [subSku, nextSku] }),
  });
  assert.deepEqual(subscriptions[0].skuIds, [subSku, nextSku]);
});

test("rejects poison records without blocking later valid rows and surfaces incomplete scan", async () => {
  const { service, entitlements } = setup({
    listEntitlements: async () => [
      entitlement({ application_id: "999" }),
      entitlement({ id: "523456789012345679" }),
    ],
  });
  await assert.rejects(service.reconcile(), /could not be reconciled/);
  assert.deepEqual(
    entitlements.map((row) => row.id),
    ["523456789012345679"],
  );
});

test("reconciliation paginates and preserves source read time; overlapping scans share work", async () => {
  const cursors: (string | undefined)[] = [];
  const { service, entitlements } = setup({
    listEntitlements: async (after) => {
      cursors.push(after);
      return after
        ? [entitlement({ id: "999456789012345678" })]
        : Array.from({ length: 100 }, (_, n) =>
            entitlement({ id: String(BigInt(entitlementId) + BigInt(n)) }),
          );
    },
  });
  const a = service.reconcile();
  const b = service.reconcile();
  assert.equal(a, b);
  await a;
  assert.equal(entitlements.length, 101);
  assert.deepEqual(cursors, [undefined, String(BigInt(entitlementId) + 99n)]);
  assert.ok(
    entitlements.slice(0, 100).every((row) => row.observedAt === observedAt),
  );
  assert.equal(entitlements[100].observedAt, "2026-11-07T12:00:00.001Z");
});

test("failed pages never delete known data and subsequent scans can retry", async () => {
  let failure = true;
  const { service, entitlements } = setup({
    listEntitlements: async (after) => {
      if (after && failure) throw new Error("temporary failure");
      return after
        ? []
        : Array.from({ length: 100 }, (_, n) =>
            entitlement({ id: String(BigInt(entitlementId) + BigInt(n)) }),
          );
    },
  });
  await assert.rejects(service.reconcile());
  assert.ok(entitlements.every((row) => !row.deleted));
  failure = false;
  await service.reconcile();
  assert.equal(entitlements.length, 200);
});

test("subscription reconciliation lists records scoped by known user without point rereads", async () => {
  const queries: string[][] = [];
  const { service, subscriptions } = setup(
    {
      listSubscriptions: async (skuId, userId) => {
        queries.push([skuId, userId]);
        return [subscription()];
      },
    },
    {
      listKnownPurchasers: async () => [user],
    },
  );
  await service.reconcile();
  assert.deepEqual(queries, [[subSku, user]]);
  assert.equal(subscriptions.length, 1);
});

test("missing subscriptions during reconciliation do not invent deletion", async () => {
  const { service, subscriptions } = setup(
    {},
    { listKnownPurchasers: async () => [user] },
  );
  await service.reconcile();
  assert.equal(subscriptions.length, 0);
});

test("failed writes do not poison per-resource queue; stopping rejects new work", async () => {
  let attempts = 0;
  const { service } = setup(
    {},
    {
      applyEntitlement: async () => {
        if (++attempts === 1) throw new Error("database unavailable");
      },
    },
  );
  await assert.rejects(
    service.handleEntitlement({
      id: entitlementId,
      skuIds: [sku],
      payload: entitlement(),
    }),
  );
  await service.handleEntitlement({
    id: entitlementId,
    skuIds: [sku],
    payload: entitlement(),
  });
  assert.equal(attempts, 2);
  await service.stop();
  await assert.rejects(
    service.handleEntitlement({
      id: entitlementId,
      skuIds: [sku],
      payload: entitlement(),
    }),
  );
});

test("queued event snapshots keep their receipt time rather than catalog completion time", async () => {
  let clock = observedAt;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const { api, store, entitlements } = setup();
  const catalog = api.listSkus;
  api.listSkus = async () => {
    await gate;
    return catalog();
  };
  const service = new MonetizationService(
    app,
    new Set([sku, subSku]),
    api,
    store,
    () => clock,
  );
  const write = service.handleEntitlement({
    id: entitlementId,
    skuIds: [sku],
    payload: entitlement(),
  });
  clock = "2026-11-07T12:01:00.000Z";
  release();
  await write;
  assert.equal(entitlements[0].observedAt, observedAt);
});

test("same-millisecond updates survive strict database timestamp guards", async () => {
  let persisted: SubscriptionSnapshot | undefined;
  const { service } = setup(
    {},
    {
      applySubscription: async (value) => {
        if (!persisted || persisted.observedAt < value.observedAt)
          persisted = value;
      },
    },
  );
  await service.handleSubscription({
    id: subscriptionId,
    skuIds: [subSku],
    payload: subscription(),
  });
  await service.handleSubscription({
    id: subscriptionId,
    skuIds: [subSku],
    payload: subscription({ status: 2, canceled_at: observedAt }),
  });
  assert.equal(persisted?.status, 2);
  assert.equal(persisted?.observedAt, "2026-11-07T12:00:00.001Z");
});

test("an in-flight reconciliation response cannot overwrite a later Gateway update", async () => {
  let resolvePage!: (rows: unknown[]) => void;
  let started!: () => void;
  const scanStarted = new Promise<void>((resolve) => {
    started = resolve;
  });
  const pageResult = new Promise<unknown[]>((resolve) => {
    resolvePage = resolve;
  });
  let persisted: EntitlementSnapshot | undefined;
  const { service } = setup(
    {
      listEntitlements: async () => {
        started();
        return pageResult;
      },
    },
    {
      applyEntitlement: async (value) => {
        if (!persisted || persisted.observedAt < value.observedAt)
          persisted = value;
      },
    },
  );
  const scan = service.reconcile();
  await scanStarted;
  await service.handleEntitlement({
    id: entitlementId,
    skuIds: [sku],
    payload: entitlement({ consumed: true }),
  });
  resolvePage([entitlement({ consumed: false })]);
  await scan;
  assert.equal(persisted?.consumed, true);
});

test("separate monetization consumers share the bot queue for the same record", async () => {
  let release!: () => void;
  let started!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const firstStarted = new Promise<void>((resolve) => {
    started = resolve;
  });
  const writes: boolean[] = [];
  const { service, api, store } = setup(
    {},
    {
      applyEntitlement: async (snapshot) => {
        writes.push(snapshot.consumed);
        if (!snapshot.consumed) {
          started();
          await gate;
        }
      },
    },
  );
  const other = new MonetizationService(
    app,
    new Set([sku, subSku]),
    api,
    store,
  );
  await Promise.all([service.refreshCatalog(), other.refreshCatalog()]);
  const first = service.handleEntitlement({
    id: entitlementId,
    skuIds: [sku],
    payload: entitlement(),
  });
  await firstStarted;
  const second = other.handleEntitlement({
    id: entitlementId,
    skuIds: [sku],
    payload: entitlement({ consumed: true }),
  });
  assert.equal(
    await keyedQueue.run("another-feature:record", () => "ready"),
    "ready",
  );
  assert.deepEqual(writes, [false]);
  release();
  await Promise.all([first, second]);
  assert.deepEqual(writes, [false, true]);
  await Promise.all([service.stop(), other.stop()]);
  assert.equal(
    await keyedQueue.run("another-feature:record", () => "still active"),
    "still active",
  );
});

test("bot queue shutdown drains accepted writes after monetization stops producing work", async () => {
  let release!: () => void;
  let started!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const firstStarted = new Promise<void>((resolve) => {
    started = resolve;
  });
  const writes: boolean[] = [];
  const { service } = setup(
    {},
    {
      applyEntitlement: async (snapshot) => {
        started();
        await gate;
        writes.push(snapshot.consumed);
      },
    },
  );
  await service.refreshCatalog();
  const first = service.handleEntitlement({
    id: entitlementId,
    skuIds: [sku],
    payload: entitlement(),
  });
  await firstStarted;
  const second = service.handleEntitlement({
    id: entitlementId,
    skuIds: [sku],
    payload: entitlement({ consumed: true }),
  });
  let drained = false;
  const drain = keyedQueue.stop().then(() => {
    drained = true;
  });
  await service.stop();
  await assert.rejects(
    keyedQueue.run("another-feature:record", () => undefined),
    /stopped/i,
  );
  await assert.rejects(
    service.handleEntitlement({
      id: entitlementId,
      skuIds: [sku],
      payload: entitlement(),
    }),
    /stopped/i,
  );
  assert.equal(drained, false);
  release();
  await Promise.all([first, second, drain]);
  assert.deepEqual(writes, [false, true]);
  await service.reconcile();
  assert.deepEqual(writes, [false, true]);
});
