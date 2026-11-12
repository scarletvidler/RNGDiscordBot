import { keyedQueue } from "../../helpers/keyedQueue.ts";
import type {
  EntitlementSnapshot,
  MonetizationStore,
  SkuSnapshot,
  SubscriptionSnapshot,
} from "../../../supabase/models/monetization.ts";
import { isSnowflake } from "./config.ts";

export interface DiscordMonetizationApi {
  listSkus(): Promise<unknown>;
  listEntitlements(after?: string): Promise<unknown>;
  listSubscriptions(
    skuId: string,
    userId: string,
    after?: string,
  ): Promise<unknown>;
}

export interface DiscordRecordEvent {
  id: string;
  skuIds: string[];
  payload: unknown;
  deleted?: boolean;
}

const PAGE_SIZE = 100;
const MAX_PAGES = 1000;

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid Discord object");
  return value as Record<string, unknown>;
}
function id(value: unknown): string {
  if (!isSnowflake(value)) throw new Error("Invalid Discord ID");
  return value;
}
function ids(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 100)
    throw new Error("Invalid Discord ID list");
  const result = value.map(id);
  if (new Set(result).size !== result.length)
    throw new Error("Duplicate Discord ID");
  return result;
}
function date(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T/.test(value) ||
    !Number.isFinite(Date.parse(value))
  ) {
    throw new Error("Invalid Discord timestamp");
  }
  return new Date(value).toISOString();
}
function optionalDate(value: unknown): string | null {
  return value == null ? null : date(value);
}
function bool(value: unknown): boolean {
  if (typeof value !== "boolean") throw new Error("Invalid Discord flag");
  return value;
}
function createdAt(snowflake: string): string {
  return new Date(
    Number((BigInt(snowflake) >> 22n) + 1420070400000n),
  ).toISOString();
}
function page(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value) || value.length > PAGE_SIZE)
    throw new Error("Invalid Discord page");
  return value.map(object);
}
function nextCursor(
  rows: Record<string, unknown>[],
  previous?: string,
): string | undefined {
  if (rows.length < PAGE_SIZE) return undefined;
  const cursor = rows
    .map((row) => id(row.id))
    .reduce((a, b) => (BigInt(a) > BigInt(b) ? a : b));
  if (previous && BigInt(cursor) <= BigInt(previous))
    throw new Error("Discord pagination did not advance");
  return cursor;
}

/** Discord records only. This service never records payments, grants perks or consumes items. */
export class MonetizationService {
  private skus = new Map<string, SkuSnapshot>();
  private catalogPromise?: Promise<void>;
  private reconciliation?: Promise<void>;
  private closed = false;

  private lastObservation = -Infinity;

  constructor(
    private readonly applicationId: string,
    private readonly api: DiscordMonetizationApi,
    private readonly store: MonetizationStore,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {
    id(applicationId);
  }

  private observationTime(): string {
    // Preserve receipt/read-start order even when different updates share a millisecond.
    // A single clock bounds memory and also orders reconciliation against Gateway events.
    this.lastObservation = Math.max(
      Date.parse(this.now()),
      this.lastObservation + 1,
    );
    return new Date(this.lastObservation).toISOString();
  }

  async refreshCatalog(): Promise<void> {
    if (this.catalogPromise) return this.catalogPromise;
    const run = async () => {
      const observedAt = this.now();
      const raw = await this.api.listSkus();
      if (!Array.isArray(raw)) throw new Error("Invalid SKU catalog");
      const catalog = new Map<string, SkuSnapshot>();
      for (const value of raw) {
        const sku = object(value);
        const skuId = id(sku.id);
        // Discord also returns non-purchasable subscription grouping records.
        if (sku.application_id === this.applicationId && sku.type === 6)
          continue;
        if (
          sku.application_id !== this.applicationId ||
          ![2, 3, 5].includes(sku.type as number)
        ) {
          throw new Error(
            "SKU does not belong to the configured application or product type",
          );
        }
        if (
          typeof sku.name !== "string" ||
          !sku.name.trim() ||
          sku.name.length > 1000 ||
          !Number.isSafeInteger(sku.flags) ||
          Number(sku.flags) < 0
        )
          throw new Error("Invalid SKU metadata");
        catalog.set(skuId, {
          applicationId: this.applicationId,
          id: skuId,
          name: sku.name,
          type: sku.type as 2 | 3 | 5,
          flags: sku.flags as number,
          observedAt,
        });
      }
      const records = [...catalog.values()];
      for (let offset = 0; offset < records.length; offset += PAGE_SIZE) {
        await this.store.upsertSkus(records.slice(offset, offset + PAGE_SIZE));
      }
      this.skus = catalog;
    };
    this.catalogPromise = run();
    try {
      await this.catalogPromise;
    } finally {
      this.catalogPromise = undefined;
    }
  }

  private async ensureCatalog(skuIds: string[]): Promise<void> {
    if (!this.skus.size || skuIds.some((skuId) => !this.skus.has(skuId)))
      await this.refreshCatalog();
  }

  private entitlement(
    raw: unknown,
    observedAt: string,
    deleted = false,
  ): EntitlementSnapshot {
    const data = object(raw);
    const entitlementId = id(data.id);
    const skuId = id(data.sku_id);
    if (data.application_id !== this.applicationId || !this.skus.has(skuId))
      throw new Error("Untrusted entitlement application or SKU");
    if (
      !Number.isInteger(data.type) ||
      Number(data.type) < 1 ||
      Number(data.type) > 8
    )
      throw new Error("Invalid entitlement type");
    const userId = data.user_id == null ? null : id(data.user_id);
    const guildId = data.guild_id == null ? null : id(data.guild_id);
    if (!userId && !guildId) throw new Error("Entitlement has no beneficiary");
    return {
      applicationId: this.applicationId,
      id: entitlementId,
      skuId,
      userId,
      guildId,
      type: data.type as number,
      startsAt: optionalDate(data.starts_at),
      endsAt: optionalDate(data.ends_at),
      consumed: data.consumed === undefined ? false : bool(data.consumed),
      deleted: deleted || bool(data.deleted),
      createdAt: createdAt(entitlementId),
      observedAt,
    };
  }

  private subscription(
    raw: unknown,
    observedAt: string,
    deleted = false,
  ): SubscriptionSnapshot {
    const data = object(raw);
    const subscriptionId = id(data.id);
    const skuIds = ids(data.sku_ids);
    const renewalSkuIds =
      data.renewal_sku_ids == null ? null : ids(data.renewal_sku_ids);
    if (
      !skuIds.length ||
      [...skuIds, ...(renewalSkuIds ?? [])].some(
        (skuId) => this.skus.get(skuId)?.type !== 5,
      )
    ) {
      throw new Error("Subscription includes an unknown subscription SKU");
    }
    if (![0, 1, 2].includes(data.status as number))
      throw new Error("Invalid subscription status");
    const start = date(data.current_period_start);
    const end = date(data.current_period_end);
    if (start > end) throw new Error("Invalid subscription period");
    return {
      applicationId: this.applicationId,
      id: subscriptionId,
      userId: id(data.user_id),
      skuIds,
      entitlementIds: ids(data.entitlement_ids),
      renewalSkuIds,
      status: data.status as 0 | 1 | 2,
      currentPeriodStart: start,
      currentPeriodEnd: end,
      canceledAt: optionalDate(data.canceled_at),
      createdAt: createdAt(subscriptionId),
      observedAt,
      deleted,
    };
  }

  async handleEntitlement(event: DiscordRecordEvent): Promise<void> {
    if (this.closed) throw new Error("Monetization stopped");
    id(event.id);
    const observedAt = this.observationTime();
    return keyedQueue.run(
      `monetization:${this.applicationId}:entitlement:${event.id}`,
      async () => {
        await this.ensureCatalog([id(object(event.payload).sku_id)]);
        // The authenticated Discord Gateway payload is the lifecycle source of truth.
        const snapshot = this.entitlement(
          event.payload,
          observedAt,
          event.deleted,
        );
        if (snapshot.id !== event.id)
          throw new Error("Entitlement event ID mismatch");
        await this.store.applyEntitlement(snapshot);
      },
    );
  }

  async handleSubscription(event: DiscordRecordEvent): Promise<void> {
    if (this.closed) throw new Error("Monetization stopped");
    id(event.id);
    const observedAt = this.observationTime();
    return keyedQueue.run(
      `monetization:${this.applicationId}:subscription:${event.id}`,
      async () => {
        const data = object(event.payload);
        await this.ensureCatalog([
          ...ids(data.sku_ids),
          ...(data.renewal_sku_ids == null ? [] : ids(data.renewal_sku_ids)),
        ]);
        const snapshot = this.subscription(
          event.payload,
          observedAt,
          event.deleted,
        );
        if (snapshot.id !== event.id)
          throw new Error("Subscription event ID mismatch");
        await this.store.applySubscription(snapshot);
      },
    );
  }

  reconcile(): Promise<void> {
    if (this.closed) return Promise.resolve();
    if (this.reconciliation) return this.reconciliation;
    this.reconciliation = this.reconcileAll().finally(() => {
      this.reconciliation = undefined;
    });
    return this.reconciliation;
  }

  private async reconcileAll(): Promise<void> {
    await this.refreshCatalog();
    let failures = 0;
    let after: string | undefined;
    for (let n = 0; n < MAX_PAGES && !this.closed; n++) {
      const observedAt = this.observationTime();
      const rows = page(await this.api.listEntitlements(after));
      for (const row of rows) {
        try {
          const snapshot = this.entitlement(row, observedAt);
          await keyedQueue.run(
            `monetization:${this.applicationId}:entitlement:${snapshot.id}`,
            () => this.store.applyEntitlement(snapshot),
          );
        } catch {
          failures++;
        }
      }
      after = nextCursor(rows, after);
      if (!after) break;
      if (n === MAX_PAGES - 1)
        throw new Error("Entitlement reconciliation page limit reached");
    }
    // Entitlement beneficiaries provide discovery for subscriptions missed during downtime.
    after = undefined;
    for (let n = 0; n < MAX_PAGES && !this.closed; n++) {
      const users = await this.store.listKnownPurchasers(
        this.applicationId,
        after,
        PAGE_SIZE,
      );
      for (const userId of users) {
        id(userId);
        for (const sku of this.skus.values()) {
          if (sku.type === 5) {
            try {
              await this.reconcileUser(sku.id, userId);
            } catch {
              failures++;
            }
          }
        }
      }
      if (users.length < PAGE_SIZE) break;
      const next = users[users.length - 1];
      if (after !== undefined && next <= after)
        throw new Error("Purchaser pagination did not advance");
      after = next;
      if (n === MAX_PAGES - 1)
        throw new Error("Purchaser reconciliation page limit reached");
    }
    if (failures && !this.closed)
      throw new Error("Some monetization records could not be reconciled");
  }

  private async reconcileUser(skuId: string, userId: string): Promise<void> {
    let after: string | undefined;
    let failures = 0;
    for (let n = 0; n < MAX_PAGES && !this.closed; n++) {
      const observedAt = this.observationTime();
      const rows = page(await this.api.listSubscriptions(skuId, userId, after));
      for (const row of rows) {
        try {
          const snapshot = this.subscription(row, observedAt);
          if (snapshot.userId !== userId || !snapshot.skuIds.includes(skuId))
            throw new Error("Subscription query scope mismatch");
          await keyedQueue.run(
            `monetization:${this.applicationId}:subscription:${snapshot.id}`,
            () => this.store.applySubscription(snapshot),
          );
        } catch {
          failures++;
        }
      }
      after = nextCursor(rows, after);
      if (!after) {
        if (failures)
          throw new Error("Some subscription records could not be reconciled");
        return;
      }
    }
    if (!this.closed)
      throw new Error("Subscription reconciliation page limit reached");
  }

  async stop(): Promise<void> {
    this.closed = true;
    await this.reconciliation?.catch(() => undefined);
  }
}
