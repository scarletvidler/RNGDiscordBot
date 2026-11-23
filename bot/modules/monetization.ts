import {
  SKUType,
  type Client,
  type Collection,
  type Entitlement,
  type SKU,
  type Subscription,
} from "discord.js";
import { keyedQueue } from "../helpers/keyedQueue.ts";
import {
  getKnownPurchasers,
  upsertEntitlement,
  upsertMonetizationSkus,
  upsertSubscription,
} from "../../supabase/models/monetization.ts";
import { getFulfillmentEntitlements } from "../../supabase/models/fulfillmentDispatch.ts";
import { dispatchFulfillment } from "./fulfillment.ts";
import {
  getSubscriptionEntitlements,
  getPendingConsumptions,
  redeemTopup,
} from "../../supabase/models/planPurchases.ts";
import {
  getPurchaseFulfillment,
  getSkuAction,
} from "../../supabase/models/skuFulfillment.ts";
import { consumeDeliveredTopup } from "./consumeTopup.ts";

const RECOVERY_INTERVAL_MS = 24 * 60 * 60 * 1_000;
const PAGE_SIZE = 100;
const MAX_PAGES = 1000;

let timer: NodeJS.Timeout | undefined;
let recovery: Promise<void> | undefined;
let catalogRefresh: Promise<void> | undefined;
let catalog = new Map<string, SKU>();
let catalogApplicationId: string | undefined;
let stopped = false;
let lastObservation = 0;

// Keep receipt/read-start order even when updates arrive in the same millisecond.
function observationTime(): string {
  lastObservation = Math.max(Date.now(), lastObservation + 1);
  return new Date(lastObservation).toISOString();
}

function getApplication(client: Client) {
  if (!client.application) throw new Error("Discord application is not ready");
  return client.application;
}

function reportFailure(operation: string): void {
  // Raw HTTP/SQL errors can contain credentials or private payloads.
  console.error(
    `[monetization] ${operation} failed; records will be retried by recovery`,
  );
}

async function refreshCatalog(client: Client): Promise<void> {
  if (catalogRefresh) return catalogRefresh;

  catalogRefresh = fetchCatalog(client).finally(() => {
    catalogRefresh = undefined;
  });
  return catalogRefresh;
}

async function fetchCatalog(client: Client): Promise<void> {
  const application = getApplication(client);
  const observedAt = observationTime();
  const skus = await application.fetchSKUs();
  await upsertMonetizationSkus(application.id, [...skus.values()], observedAt);

  catalog = new Map(
    [...skus].filter(([, sku]) =>
      [SKUType.Durable, SKUType.Consumable, SKUType.Subscription].includes(
        sku.type,
      ),
    ),
  );
  catalogApplicationId = application.id;
}

async function ensureSkus(
  client: Client,
  skuIds: readonly string[],
  subscription = false,
): Promise<void> {
  const applicationId = getApplication(client).id;
  if (
    catalogApplicationId !== applicationId ||
    skuIds.some((skuId) => !catalog.has(skuId))
  ) {
    await refreshCatalog(client);
  }

  if (
    catalogApplicationId !== applicationId ||
    !skuIds.length ||
    skuIds.some(
      (skuId) =>
        !catalog.has(skuId) ||
        (subscription && catalog.get(skuId)?.type !== SKUType.Subscription),
    )
  ) {
    throw new Error("Unknown application SKU");
  }
}

export async function recordEntitlement(
  client: Client,
  entitlement: Entitlement,
  deleted = false,
  observedAt = observationTime(),
): Promise<void> {
  if (stopped) throw new Error("Monetization stopped");
  const applicationId = getApplication(client).id;
  if (entitlement.applicationId !== applicationId) {
    throw new Error("Foreign entitlement application");
  }

  // Discord may mutate cached objects while a previous write is still queued.
  const record = { ...entitlement };
  await keyedQueue.run(
    `monetization:${applicationId}:entitlement:${entitlement.id}`,
    async () => {
      await ensureSkus(client, [record.skuId]);
      await upsertEntitlement(applicationId, record, observedAt, deleted);
      await dispatchFulfillment(client, applicationId, record.id);
    },
  );
}

export async function recordSubscription(
  client: Client,
  subscription: Subscription,
  deleted = false,
  observedAt = observationTime(),
): Promise<void> {
  if (stopped) throw new Error("Monetization stopped");
  const applicationId = getApplication(client).id;
  const record = {
    ...subscription,
    skuIds: [...subscription.skuIds],
    entitlementIds: [...subscription.entitlementIds],
    renewalSkuIds: subscription.renewalSkuIds
      ? [...subscription.renewalSkuIds]
      : null,
  };
  await keyedQueue.run(
    `monetization:${applicationId}:subscription:${subscription.id}`,
    async () => {
      await ensureSkus(
        client,
        [...record.skuIds, ...(record.renewalSkuIds ?? [])],
        true,
      );
      await upsertSubscription(applicationId, record, observedAt, deleted);

      const entitlementIds = await getSubscriptionEntitlements(
        applicationId,
        record.id,
      );
      for (const entitlementId of entitlementIds) {
        await keyedQueue.run(
          `monetization:${applicationId}:entitlement:${entitlementId}`,
          () => dispatchFulfillment(client, applicationId, entitlementId),
        );
      }
    },
  );
}

export async function redeemGuildTopup(
  client: Client,
  entitlementId: string,
  buyerId: string,
  guildId: string,
): Promise<void> {
  if (stopped) throw new Error("Monetization stopped");
  const application = getApplication(client);
  const observedAt = observationTime();
  const entitlement = await application.entitlements.fetch({
    entitlement: entitlementId,
    force: true,
    cache: false,
  });
  if (
    entitlement.applicationId !== application.id ||
    entitlement.userId !== buyerId
  ) {
    throw new Error("This top-up does not belong to the buyer");
  }

  const record = { ...entitlement };
  await keyedQueue.run(
    `monetization:${application.id}:entitlement:${entitlementId}`,
    async () => {
      await ensureSkus(client, [record.skuId]);
      await upsertEntitlement(application.id, record, observedAt);
      await redeemTopup(application.id, entitlementId, buyerId, guildId);
      await dispatchFulfillment(client, application.id, entitlementId);

      const fulfillment = await getPurchaseFulfillment(
        application.id,
        entitlementId,
      );
      if (
        fulfillment?.applied_state !== "granted" ||
        fulfillment.target_id !== guildId
      ) {
        throw new Error("Top-up delivery is pending or unavailable");
      }
    },
  );
}

export async function redeemAvailableGuildTopups(
  client: Client,
  buyerId: string,
  guildId: string,
): Promise<{ redeemed: number; failed: number }> {
  const application = getApplication(client);
  let after: string | undefined;
  let redeemed = 0;
  let failed = 0;

  for (let page = 0; page < MAX_PAGES; page++) {
    const entitlements = await application.entitlements.fetch({
      user: buyerId,
      limit: PAGE_SIZE,
      after,
      excludeEnded: true,
      excludeDeleted: true,
      cache: false,
    });
    for (const entitlement of entitlements.values()) {
      if (
        entitlement.userId !== buyerId ||
        entitlement.guildId ||
        entitlement.consumed ||
        entitlement.deleted
      )
        continue;
      const config = await getSkuAction(application.id, entitlement.skuId);
      if (
        !config?.enabled ||
        config.grant_action !== "grant_tokens" ||
        config.grant_settings.redeem_to_guild !== true
      )
        continue;

      try {
        await redeemGuildTopup(client, entitlement.id, buyerId, guildId);
        redeemed++;
      } catch {
        failed++;
        console.error(
          "[monetization] a purchased top-up could not be redeemed",
        );
      }
    }

    after = getNextPageCursor(entitlements, after);
    if (!after) return { redeemed, failed };
  }

  throw new Error("Top-up redemption page limit reached");
}

function getNextPageCursor(
  rows: Collection<string, { id: string }>,
  after?: string,
): string | undefined {
  if (rows.size < PAGE_SIZE) return undefined;
  const next = [...rows.keys()].reduce((latestId, id) =>
    BigInt(latestId) > BigInt(id) ? latestId : id,
  );
  if (after && BigInt(next) <= BigInt(after)) {
    throw new Error("Discord pagination did not advance");
  }

  return next;
}

async function recoverPurchases(client: Client): Promise<void> {
  const application = getApplication(client);
  await refreshCatalog(client);
  let failures = 0;
  let after: string | undefined;
  for (let page = 0; page < MAX_PAGES && !stopped; page++) {
    const observedAt = observationTime();
    const entitlements = await application.entitlements.fetch({
      limit: PAGE_SIZE,
      after,
      excludeEnded: false,
      excludeDeleted: false,
      cache: false,
    });
    for (const entitlement of entitlements.values()) {
      if (stopped) return;
      try {
        await recordEntitlement(client, entitlement, false, observedAt);
      } catch {
        failures++;
      }
    }
    after = getNextPageCursor(entitlements, after);
    if (!after) break;
    if (page === MAX_PAGES - 1) {
      throw new Error("Entitlement recovery page limit reached");
    }
  }

  // Saved beneficiaries also discover subscriptions whose live events were missed.
  after = undefined;
  for (let page = 0; page < MAX_PAGES && !stopped; page++) {
    const userIds = await getKnownPurchasers(application.id, after, PAGE_SIZE);
    for (const userId of userIds) {
      for (const sku of catalog.values()) {
        if (stopped) return;
        if (sku.type !== SKUType.Subscription) continue;
        try {
          await recoverSubscriptions(client, sku.id, userId);
        } catch {
          failures++;
        }
      }
    }
    if (userIds.length < PAGE_SIZE) break;
    const next = userIds[userIds.length - 1];
    if (after && next <= after) {
      throw new Error("Purchaser pagination did not advance");
    }

    after = next;
    if (page === MAX_PAGES - 1) {
      throw new Error("Purchaser recovery page limit reached");
    }
  }

  if (failures && !stopped) {
    throw new Error("Some monetization records could not be recovered");
  }
}

async function recoverSubscriptions(
  client: Client,
  skuId: string,
  userId: string,
): Promise<void> {
  let after: string | undefined;
  let failures = 0;
  for (let page = 0; page < MAX_PAGES && !stopped; page++) {
    const observedAt = observationTime();
    // The installed manager supports cache:false, though its options type omits it.
    const options = {
      sku: skuId,
      user: userId,
      after,
      limit: PAGE_SIZE,
      cache: false,
    };
    const subscriptions =
      await getApplication(client).subscriptions.fetch(options);
    for (const subscription of subscriptions.values()) {
      if (stopped) return;
      try {
        if (
          subscription.userId !== userId ||
          !subscription.skuIds.includes(skuId)
        ) {
          throw new Error("Subscription query scope mismatch");
        }

        await recordSubscription(client, subscription, false, observedAt);
      } catch {
        failures++;
      }
    }
    after = getNextPageCursor(subscriptions, after);
    if (!after) break;
    if (page === MAX_PAGES - 1) {
      throw new Error("Subscription recovery page limit reached");
    }
  }

  if (failures && !stopped) {
    throw new Error("Some subscriptions could not be recovered");
  }
}

export function syncMonetization(client: Client): Promise<void> {
  if (stopped) return Promise.resolve();
  // A daily timer cannot start another scan while the startup scan is running.
  recovery ??= recoverMonetization(client).finally(() => {
    recovery = undefined;
  });
  return recovery;
}

async function recoverMonetization(client: Client): Promise<void> {
  let failed = false;
  try {
    await recoverPurchases(client);
  } catch {
    failed = true;
  }
  // Local durable work must recover even when Discord's API is unavailable.
  try {
    const applicationId = getApplication(client).id;
    let after: string | undefined;
    for (let page = 0; page < MAX_PAGES && !stopped; page++) {
      const entitlementIds = await getFulfillmentEntitlements(
        applicationId,
        after,
        PAGE_SIZE,
      );
      for (const entitlementId of entitlementIds) {
        if (stopped) return;
        try {
          await keyedQueue.run(
            `monetization:${applicationId}:entitlement:${entitlementId}`,
            () => dispatchFulfillment(client, applicationId, entitlementId),
          );
        } catch {
          failed = true;
        }
      }
      if (entitlementIds.length < PAGE_SIZE) break;
      const next = entitlementIds[entitlementIds.length - 1];
      if (after && next <= after) {
        throw new Error("Fulfillment pagination did not advance");
      }

      after = next;
      if (page === MAX_PAGES - 1) {
        throw new Error("Fulfillment recovery page limit reached");
      }
    }
  } catch {
    failed = true;
  }
  // Discord consumption can fail after tokens commit. Retry it independently;
  // a consumed entitlement is acknowledged locally without granting tokens again.
  try {
    const applicationId = getApplication(client).id;
    let after: string | undefined;
    for (let page = 0; page < MAX_PAGES && !stopped; page++) {
      const entitlementIds = await getPendingConsumptions(
        applicationId,
        after,
        PAGE_SIZE,
      );
      for (const entitlementId of entitlementIds) {
        if (stopped) return;
        try {
          await keyedQueue.run(
            `monetization:${applicationId}:entitlement:${entitlementId}`,
            () => consumeDeliveredTopup(client, applicationId, entitlementId),
          );
        } catch {
          failed = true;
        }
      }
      if (entitlementIds.length < PAGE_SIZE) break;
      const next = entitlementIds[entitlementIds.length - 1];
      if (after && next <= after)
        throw new Error("Consumption pagination did not advance");
      after = next;
      if (page === MAX_PAGES - 1)
        throw new Error("Consumption recovery page limit reached");
    }
  } catch {
    failed = true;
  }
  if (failed && !stopped) {
    throw new Error("Some monetization work could not be recovered");
  }
}

export function startDiscordMonetization(client: Client): void {
  if (timer) return;
  stopped = false;
  const sync = () => {
    void syncMonetization(client).catch(() => reportFailure("recovery"));
  };
  sync();
  timer = setInterval(sync, RECOVERY_INTERVAL_MS);
  timer.unref();
}

export async function stopDiscordMonetization(): Promise<void> {
  stopped = true;
  clearInterval(timer);
  timer = undefined;
  await recovery?.catch(() => undefined);
}
