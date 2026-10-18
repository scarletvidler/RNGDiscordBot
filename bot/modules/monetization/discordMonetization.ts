import type { Collection, Entitlement, Subscription } from "discord.js";
import type { ExtendedClient } from "../../types.ts";
import { DBGetGuild } from "../../../supabase/models/guilds.ts";
import {
  getActiveDiscordSkus,
  getDiscordSku,
  getDiscordSubscription,
  getDiscordEntitlement,
  grantDiscordTokens,
  upsertDiscordEntitlement,
  upsertDiscordSubscription,
  type DBDiscordSubscription,
} from "../../../supabase/models/monetization.ts";
import { setUpExtendedGuild } from "../startGuilds.ts";
import { syncDiscordPremiumSkuConfig } from "./config.ts";
import {
  calculateSubscriptionGrant,
  type SubscriptionGrantState,
} from "./grantPolicy.ts";

const DEFAULT_RECONCILIATION_INTERVAL_MINUTES = 360;

async function ensureGuildRecord(
  client: ExtendedClient,
  guildId: string,
): Promise<boolean> {
  if (await DBGetGuild(guildId)) return true;

  const guild =
    client.guilds.cache.get(guildId) ??
    (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild) {
    console.warn(
      `Ignoring Discord monetization event for unavailable guild ${guildId}`,
    );
    return false;
  }

  await setUpExtendedGuild(guild, client);
  return true;
}

async function recordEntitlement(
  client: ExtendedClient,
  entitlement: Entitlement,
): Promise<boolean> {
  if (!entitlement.guildId) return false;

  const sku = await getDiscordSku(entitlement.skuId);
  if (!sku?.active) return false;
  if (!(await ensureGuildRecord(client, entitlement.guildId))) return false;

  await upsertDiscordEntitlement({
    id: entitlement.id,
    guild_id: entitlement.guildId,
    user_id: entitlement.userId ?? null,
    sku_id: entitlement.skuId,
    deleted: entitlement.deleted,
    consumed: entitlement.consumed,
    starts_at: entitlement.startsAt?.toISOString() ?? null,
    ends_at: entitlement.endsAt?.toISOString() ?? null,
  });
  return true;
}

async function fetchEntitlement(
  client: ExtendedClient,
  entitlementId: string,
): Promise<Entitlement | null> {
  const application = client.application;
  if (!application) return null;

  try {
    return await application.entitlements.fetch({
      entitlement: entitlementId,
      force: true,
    });
  } catch (error) {
    console.error(`Failed to fetch entitlement ${entitlementId}:`, error);
    return null;
  }
}

async function findGuildEntitlementForSubscription(
  client: ExtendedClient,
  subscription: Subscription,
): Promise<Entitlement | null> {
  for (const entitlementId of subscription.entitlementIds) {
    const entitlement = await fetchEntitlement(client, entitlementId);
    if (entitlement?.guildId && entitlement.isActive()) return entitlement;
  }

  for (const entitlementId of subscription.entitlementIds) {
    const stored = await getDiscordEntitlement(entitlementId);
    if (!stored || stored.deleted) continue;
    if (stored.ends_at && stored.ends_at <= new Date().toISOString()) continue;

    const entitlement = await fetchEntitlement(client, entitlementId);
    if (entitlement?.guildId) return entitlement;
  }

  return null;
}

async function findSubscriptionForEntitlement(
  client: ExtendedClient,
  entitlement: Entitlement,
): Promise<Subscription | null> {
  const application = client.application;
  if (!application || !entitlement.userId) return null;

  try {
    const subscriptions = (await application.subscriptions.fetch({
      sku: entitlement.skuId,
      user: entitlement.userId,
      limit: 100,
    })) as Collection<string, Subscription>;
    return (
      subscriptions.find((subscription) =>
        subscription.entitlementIds.includes(entitlement.id),
      ) ?? null
    );
  } catch (error) {
    console.error(
      `Failed to find a subscription for entitlement ${entitlement.id}:`,
      error,
    );
    return null;
  }
}

function toGrantState(
  subscription: Pick<
    DBDiscordSubscription,
    "sku_id" | "current_period_start" | "current_period_end"
  >,
  tokensPerPeriod: number,
): SubscriptionGrantState {
  return {
    skuId: subscription.sku_id,
    tokensPerPeriod,
    periodStart: subscription.current_period_start,
    periodEnd: subscription.current_period_end,
  };
}

async function updateCachedGuildBalance(
  client: ExtendedClient,
  guildId: string,
  grantedTokens: number,
): Promise<void> {
  const guild = client.installedGuilds.find((item) => item.id === guildId);
  if (!guild) return;

  guild.settings.logging.token_limit += grantedTokens;
  guild.settings.logging.token_balance = Math.max(
    guild.settings.logging.token_limit -
      guild.settings.logging.token_total_usage,
    0,
  );
}

export async function processDiscordSubscription(
  client: ExtendedClient,
  subscription: Subscription,
  knownEntitlement?: Entitlement,
): Promise<void> {
  const entitlement =
    knownEntitlement ??
    (await findGuildEntitlementForSubscription(client, subscription));
  if (!entitlement?.guildId || !entitlement.isActive()) return;

  const skuId = subscription.skuIds.find((id) => id === entitlement.skuId);
  if (!skuId) return;

  const nextSku = await getDiscordSku(skuId);
  if (!nextSku?.active) return;
  if (!(await recordEntitlement(client, entitlement))) return;

  const previousSubscription = await getDiscordSubscription(subscription.id);
  const previousSku = previousSubscription
    ? await getDiscordSku(previousSubscription.sku_id)
    : null;
  const nextState: SubscriptionGrantState = {
    skuId,
    tokensPerPeriod: nextSku.tokens_per_period,
    periodStart: subscription.currentPeriodStartAt.toISOString(),
    periodEnd: subscription.currentPeriodEndAt.toISOString(),
  };
  if (
    previousSubscription &&
    Date.parse(previousSubscription.current_period_start) >
      Date.parse(nextState.periodStart)
  ) {
    console.warn(
      `Ignoring stale subscription event for ${subscription.id} (${nextState.periodStart})`,
    );
    return;
  }
  const previousState =
    previousSubscription && previousSku
      ? toGrantState(previousSubscription, previousSku.tokens_per_period)
      : null;
  const amount = calculateSubscriptionGrant(previousState, nextState);

  if (amount > 0) {
    const granted = await grantDiscordTokens({
      guildId: entitlement.guildId,
      source: "discord_subscription",
      sourceKey: `discord-subscription:${subscription.id}:${nextState.periodStart}:${skuId}`,
      amount,
      subscriptionId: subscription.id,
      entitlementId: entitlement.id,
      skuId,
      periodStart: nextState.periodStart,
      periodEnd: nextState.periodEnd,
    });

    if (granted) {
      await updateCachedGuildBalance(client, entitlement.guildId, amount);
      console.log(
        `Granted ${amount} Discord subscription tokens to guild ${entitlement.guildId}`,
      );
    }
  }

  await upsertDiscordSubscription({
    id: subscription.id,
    guild_id: entitlement.guildId,
    purchaser_user_id: subscription.userId,
    sku_id: skuId,
    entitlement_id: entitlement.id,
    status: Number(subscription.status),
    current_period_start: nextState.periodStart,
    current_period_end: nextState.periodEnd,
    canceled_at: subscription.canceledAt?.toISOString() ?? null,
    renewal_sku_ids: subscription.renewalSkuIds,
  });
}

export async function processDiscordEntitlement(
  client: ExtendedClient,
  entitlement: Entitlement,
): Promise<void> {
  if (!(await recordEntitlement(client, entitlement))) return;
  if (!entitlement.guildId || !entitlement.isActive()) return;

  const subscription = await findSubscriptionForEntitlement(
    client,
    entitlement,
  );
  if (subscription) {
    await processDiscordSubscription(client, subscription, entitlement);
    return;
  }

  if (!entitlement.isTest()) return;
  const sku = await getDiscordSku(entitlement.skuId);
  if (!sku?.active) return;

  const granted = await grantDiscordTokens({
    guildId: entitlement.guildId,
    source: "discord_test_entitlement",
    sourceKey: `discord-test-entitlement:${entitlement.id}`,
    amount: sku.tokens_per_period,
    entitlementId: entitlement.id,
    skuId: entitlement.skuId,
  });
  if (granted) {
    await updateCachedGuildBalance(
      client,
      entitlement.guildId,
      sku.tokens_per_period,
    );
  }
}

export async function reconcileDiscordMonetization(
  client: ExtendedClient,
): Promise<void> {
  const application = client.application;
  if (!application) return;

  const skus = await getActiveDiscordSkus();
  for (const sku of skus) {
    let after: string | undefined;
    do {
      const entitlements = await application.entitlements.fetch({
        skus: [sku.sku_id],
        excludeEnded: true,
        excludeDeleted: true,
        limit: 100,
        after,
        cache: true,
      });

      for (const entitlement of entitlements.values()) {
        await processDiscordEntitlement(client, entitlement);
      }

      after =
        entitlements.size === 100
          ? entitlements.last()?.id
          : undefined;
    } while (after);
  }
}

function getReconciliationIntervalMs(): number {
  const configured = Number(
    process.env.DISCORD_MONETIZATION_RECONCILE_MINUTES ??
      DEFAULT_RECONCILIATION_INTERVAL_MINUTES,
  );
  const minutes =
    Number.isFinite(configured) && configured >= 5
      ? configured
      : DEFAULT_RECONCILIATION_INTERVAL_MINUTES;
  return minutes * 60_000;
}

export async function startDiscordMonetization(
  client: ExtendedClient,
): Promise<void> {
  const configuredSkus = await syncDiscordPremiumSkuConfig();
  const activeSkus = await getActiveDiscordSkus();
  if (activeSkus.length === 0) {
    console.warn(
      "Discord monetization is disabled because no active SKU mappings are configured.",
    );
    return;
  }

  console.log(
    `Starting Discord monetization with ${activeSkus.length} active SKU(s)` +
      (configuredSkus > 0 ? ` (${configuredSkus} synced from the environment)` : ""),
  );
  await reconcileDiscordMonetization(client).catch((error) => {
    console.error("Initial Discord monetization reconciliation failed:", error);
  });

  const timer = setInterval(() => {
    reconcileDiscordMonetization(client).catch((error) => {
      console.error("Discord monetization reconciliation failed:", error);
    });
  }, getReconciliationIntervalMs());
  timer.unref();
}
