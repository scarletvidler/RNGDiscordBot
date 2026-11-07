import type { Client, Entitlement, Subscription } from "discord.js";
import { Routes } from "discord-api-types/v10";
import { createMonetizationStore, closeMonetizationStore } from "../../../supabase/models/monetization.ts";
import { readMonetizationConfig } from "./config.ts";
import { MonetizationService, type DiscordMonetizationApi } from "./service.ts";

const runtimes = new WeakMap<Client, { service: MonetizationService; timer: NodeJS.Timeout }>();
const stopping = new WeakSet<Client>();

/** Only fixed operation labels are logged: HTTP/SQL errors can contain credentials or payloads. */
export function reportMonetizationFailure(operation: string): void {
  console.error(`[monetization] ${operation} failed; records may be stale until reconciliation succeeds`);
}

export function createDiscordMonetizationApi(client: Pick<Client, "rest">, applicationId: string, skuIds: ReadonlySet<string>): DiscordMonetizationApi {
  const get = async (route: `/${string}`, query?: URLSearchParams): Promise<unknown> => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await client.rest.get(route, { query, signal: AbortSignal.timeout(20_000) });
      } catch (error) {
        const status = typeof error === "object" && error !== null && "status" in error ? Number(error.status) : undefined;
        // Discord.js handles rate-limit queues. Retry transient failures only, never permanent 4xx.
        if (attempt >= 2 || (status !== undefined && status < 500 && status !== 429)) throw error;
        await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
      }
    }
  };
  return {
    listSkus: () => get(Routes.skus(applicationId)),
    getEntitlement: (id) => get(Routes.entitlement(applicationId, id)),
    getSubscription: (skuId, id) => get(Routes.skuSubscription(skuId, id)),
    listEntitlements: (after) => {
      const query = new URLSearchParams({ limit: "100", exclude_ended: "false", exclude_deleted: "false", sku_ids: [...skuIds].join(",") });
      if (after) query.set("after", after);
      return get(Routes.entitlements(applicationId), query);
    },
    listSubscriptions: (skuId, userId, after) => {
      const query = new URLSearchParams({ limit: "100", user_id: userId });
      if (after) query.set("after", after);
      return get(Routes.skuSubscriptions(skuId), query);
    },
  };
}

function runtime(client: Client): MonetizationService | undefined {
  if (stopping.has(client)) return undefined;
  const existing = runtimes.get(client);
  if (existing) return existing.service;
  const config = readMonetizationConfig();
  if (!config) return undefined;
  const applicationId = client.application?.id;
  if (!applicationId) throw new Error("Monetization requires a ready Discord application");
  const service = new MonetizationService(applicationId, config.skuIds,
    createDiscordMonetizationApi(client, applicationId, config.skuIds), createMonetizationStore());
  const timer = setInterval(() => {
    void service.reconcile().catch(() => reportMonetizationFailure("periodic reconciliation"));
  }, config.reconcileMs);
  timer.unref();
  runtimes.set(client, { service, timer });
  return service;
}

export async function startDiscordMonetization(client: Client): Promise<void> {
  try {
    const service = runtime(client);
    // Do not hold bot readiness or existing guild initialization behind a historical scan.
    void service?.reconcile().catch(() => reportMonetizationFailure("startup reconciliation"));
  } catch {
    reportMonetizationFailure("startup configuration");
  }
}

export async function stopDiscordMonetization(client: Client): Promise<void> {
  stopping.add(client);
  const current = runtimes.get(client);
  if (current) {
    clearInterval(current.timer);
    await current.service.stop();
    runtimes.delete(client);
  }
  await closeMonetizationStore();
}

export async function recordEntitlementEvent(client: Client, value: Entitlement, deleted = false): Promise<void> {
  try {
    const service = runtime(client);
    if (!service) return;
    await service.handleEntitlement({ id: value.id, skuIds: [value.skuId], deleted,
      fallback: deleted ? {
        id: value.id, sku_id: value.skuId, application_id: value.applicationId,
        user_id: value.userId, guild_id: value.guildId, type: value.type,
        starts_at: value.startsAt?.toISOString() ?? null, ends_at: value.endsAt?.toISOString() ?? null,
        consumed: value.consumed, deleted: true,
      } : undefined,
    });
  } catch {
    reportMonetizationFailure("entitlement event");
  }
}

export async function recordSubscriptionEvent(client: Client, value: Subscription, deleted = false): Promise<void> {
  try {
    const service = runtime(client);
    if (!service) return;
    await service.handleSubscription({ id: value.id, skuIds: value.skuIds, deleted,
      fallback: deleted ? {
        id: value.id, user_id: value.userId, sku_ids: value.skuIds,
        entitlement_ids: value.entitlementIds, renewal_sku_ids: value.renewalSkuIds,
        current_period_start: value.currentPeriodStartAt.toISOString(),
        current_period_end: value.currentPeriodEndAt.toISOString(),
        canceled_at: value.canceledAt?.toISOString() ?? null, status: value.status,
      } : undefined,
    });
  } catch {
    reportMonetizationFailure("subscription event");
  }
}
