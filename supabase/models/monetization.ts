import { getSupabaseAdmin } from "../client.ts";
import type { Database, Json } from "../types.ts";

export interface SkuSnapshot {
  applicationId: string;
  id: string;
  name: string;
  type: 2 | 3 | 5;
  flags: number;
  observedAt: string;
}
export interface SubscriptionSnapshot {
  applicationId: string;
  id: string;
  userId: string;
  skuIds: string[];
  entitlementIds: string[];
  renewalSkuIds: string[] | null;
  status: 0 | 1 | 2;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  canceledAt: string | null;
  createdAt: string;
  observedAt: string;
  deleted: boolean;
}
export interface EntitlementSnapshot {
  applicationId: string;
  id: string;
  skuId: string;
  userId: string | null;
  guildId: string | null;
  type: number;
  startsAt: string | null;
  endsAt: string | null;
  consumed: boolean;
  deleted: boolean;
  createdAt: string;
  observedAt: string;
}
export interface MonetizationStore {
  upsertSkus(skus: SkuSnapshot[]): Promise<void>;
  applySubscription(snapshot: SubscriptionSnapshot): Promise<void>;
  applyEntitlement(snapshot: EntitlementSnapshot): Promise<void>;
  listKnownPurchasers(
    applicationId: string,
    after?: string,
    limit?: number,
  ): Promise<string[]>;
}

/** The private schema is deliberately outside the Supabase Data API schema types. */
export interface PurchaseRecord {
  application_id: string;
  id: string;
  purchaser_discord_id: string | null;
  discord_user_id: string | null;
  title: string;
  created_at: string;
  observed_at: string;
  deleted: boolean;
}
export interface SubscriptionRecord extends PurchaseRecord {
  status: 0 | 1 | 2;
  current_period_start: string;
  current_period_end: string;
  canceled_at: string | null;
  entitlement_ids: string[];
  renewal_sku_ids: string[] | null;
  items: Array<{ sku_id: string; title: string; is_current: boolean }>;
}
export interface OneTimePurchaseRecord extends PurchaseRecord {
  entitlement_id: string;
  sku_id: string;
  guild_id: string | null;
  beneficiary_discord_id: string | null;
  kind: "durable" | "consumable";
  consumed: boolean;
}
export interface RecordFilter {
  applicationId: string;
  userId?: string;
  guildId?: string;
  after?: string;
  limit?: number;
}
export interface MonetizationReader {
  listSubscriptions(filter: RecordFilter): Promise<SubscriptionRecord[]>;
  listOneTimePurchases(filter: RecordFilter): Promise<OneTimePurchaseRecord[]>;
}
type RpcFunctions = Database["public"]["Functions"];
export type MonetizationRpcName = keyof RpcFunctions;
export interface MonetizationRpcClient {
  rpc(
    name: MonetizationRpcName,
    args: RpcFunctions[MonetizationRpcName]["Args"],
  ): PromiseLike<{ data: unknown; error: unknown }>;
}

const snowflake = /^[0-9]{1,20}$/;
function id(value: string): void {
  if (!snowflake.test(value)) throw new Error("Invalid Discord identifier");
}
function timestamp(value: string | null): void {
  if (
    value !== null &&
    (!/^\d{4}-\d\d-\d\dT/.test(value) || !Number.isFinite(Date.parse(value)))
  ) {
    throw new Error("Invalid timestamp");
  }
}
function page(after: string | undefined, limit: number): void {
  if (after !== undefined && (after.length > 128 || after.length === 0))
    throw new Error("Invalid cursor");
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new Error("Invalid page size");
}
function base(value: {
  applicationId: string;
  id: string;
  observedAt: string;
}): void {
  id(value.applicationId);
  id(value.id);
  timestamp(value.observedAt);
}
/** Injectable RPC boundary keeps automated tests off live Supabase. */
export function createMonetizationModels(
  client: MonetizationRpcClient,
): MonetizationStore & MonetizationReader {
  async function call<T>(
    name: MonetizationRpcName,
    args: RpcFunctions[MonetizationRpcName]["Args"],
  ): Promise<T> {
    const response = await client.rpc(name, args);
    if (response.error) throw response.error;
    return response.data as T;
  }
  async function read<T>(kind: string, filter: RecordFilter): Promise<T[]> {
    id(filter.applicationId);
    if (filter.userId) id(filter.userId);
    if (filter.guildId) id(filter.guildId);
    page(filter.after, filter.limit ?? 100);
    return call<T[]>("monetization_read_records", {
      kind,
      app: filter.applicationId,
      usr: filter.userId ?? null,
      guild: filter.guildId ?? null,
      after_id: filter.after ?? null,
      page_size: filter.limit ?? 100,
    });
  }
  return {
    async upsertSkus(skus) {
      if (skus.length > 100) throw new Error("SKU batch exceeds limit");
      for (const sku of skus) {
        base(sku);
        if (
          ![2, 3, 5].includes(sku.type) ||
          !sku.name.trim() ||
          sku.name.length > 512 ||
          !Number.isSafeInteger(sku.flags) ||
          sku.flags < 0
        )
          throw new Error("Invalid SKU");
      }
      await call("monetization_upsert_skus", {
        records: skus as unknown as Json,
      });
    },
    async applySubscription(snapshot) {
      base(snapshot);
      id(snapshot.userId);
      if (
        ![0, 1, 2].includes(snapshot.status) ||
        snapshot.skuIds.length === 0 ||
        snapshot.skuIds.length > 100
      )
        throw new Error("Invalid subscription");
      for (const value of [
        ...snapshot.skuIds,
        ...snapshot.entitlementIds,
        ...(snapshot.renewalSkuIds ?? []),
      ])
        id(value);
      for (const value of [
        snapshot.currentPeriodStart,
        snapshot.currentPeriodEnd,
        snapshot.canceledAt,
        snapshot.createdAt,
      ])
        timestamp(value);
      if (
        Date.parse(snapshot.currentPeriodEnd) <
        Date.parse(snapshot.currentPeriodStart)
      )
        throw new Error("Invalid subscription period");
      await call("monetization_apply_subscription", {
        r: snapshot as unknown as Json,
      });
    },
    async applyEntitlement(snapshot) {
      base(snapshot);
      id(snapshot.skuId);
      if (snapshot.userId !== null) id(snapshot.userId);
      if (snapshot.guildId !== null) id(snapshot.guildId);
      if (snapshot.userId === null && snapshot.guildId === null)
        throw new Error("Entitlement requires a beneficiary");
      if (
        !Number.isInteger(snapshot.type) ||
        snapshot.type < 1 ||
        snapshot.type > 255
      )
        throw new Error("Invalid entitlement type");
      for (const value of [
        snapshot.startsAt,
        snapshot.endsAt,
        snapshot.createdAt,
      ])
        timestamp(value);
      await call("monetization_apply_entitlement", {
        r: snapshot as unknown as Json,
      });
    },
    async listKnownPurchasers(applicationId, after, limit = 100) {
      id(applicationId);
      page(after, limit);
      return call("monetization_known_purchasers", {
        app: applicationId,
        after_id: after ?? null,
        page_size: limit,
      });
    },
    listSubscriptions: (filter) =>
      read<SubscriptionRecord>("subscriptions", filter),
    listOneTimePurchases: (filter) =>
      read<OneTimePurchaseRecord>("one_time_purchases", filter),
  };
}

/** Reuse the same server-side Supabase client and credentials as all other models. */
export function createMonetizationStore(): MonetizationStore &
  MonetizationReader {
  const client = getSupabaseAdmin();
  if (!client)
    throw new Error("Supabase is not configured for monetization records");
  return createMonetizationModels({
    rpc: (name, args) =>
      client.rpc(name, args).abortSignal(AbortSignal.timeout(12_000)),
  });
}
