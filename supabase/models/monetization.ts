import {
  SKUType,
  type Entitlement,
  type SKU,
  type Subscription,
} from "discord.js";
import { getSupabaseAdmin } from "../client.ts";

// Private-schema records are not part of the generated Supabase Data API types.
// Subscription and one-time RPC projections both read monetization.discord_purchases.
// Keep their existing response contracts for callers across the table migration.
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

function createdAt(id: string): string {
  return new Date(Number((BigInt(id) >> 22n) + 1420070400000n)).toISOString();
}

export async function upsertMonetizationSkus(
  applicationId: string,
  skus: readonly SKU[],
  observedAt: string,
): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase client not initialized");

  if (skus.some((sku) => sku.applicationId !== applicationId)) {
    throw new Error("SKU belongs to another application");
  }

  const records = skus
    .filter((sku) => sku.type !== SKUType.SubscriptionGroup)
    .map((sku) => ({
      applicationId,
      id: sku.id,
      name: sku.name,
      type: sku.type,
      flags: sku.flags.bitfield,
      observedAt,
    }));
  for (let offset = 0; offset < records.length; offset += 100) {
    const { error } = await supabase
      .rpc("monetization_upsert_skus", {
        records: records.slice(offset, offset + 100),
      })
      .abortSignal(AbortSignal.timeout(12_000));

    if (error) throw error;
  }
}

export async function upsertEntitlement(
  applicationId: string,
  value: Pick<
    Entitlement,
    | "id"
    | "applicationId"
    | "skuId"
    | "userId"
    | "guildId"
    | "type"
    | "startsTimestamp"
    | "endsTimestamp"
    | "consumed"
    | "deleted"
  >,
  observedAt: string,
  deleted = false,
): Promise<void> {
  if (value.applicationId !== applicationId) {
    throw new Error("Entitlement belongs to another application");
  }
  if (!value.userId && !value.guildId) {
    throw new Error("Entitlement requires a beneficiary");
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase client not initialized");

  const { error } = await supabase
    .rpc("monetization_apply_entitlement", {
      r: {
        applicationId,
        id: value.id,
        skuId: value.skuId,
        userId: value.userId ?? null,
        guildId: value.guildId ?? null,
        type: value.type,
        startsAt:
          value.startsTimestamp == null
            ? null
            : new Date(value.startsTimestamp).toISOString(),
        endsAt:
          value.endsTimestamp == null
            ? null
            : new Date(value.endsTimestamp).toISOString(),
        consumed: value.consumed ?? false,
        deleted: deleted || value.deleted,
        createdAt: createdAt(value.id),
        observedAt,
      },
    })
    .abortSignal(AbortSignal.timeout(12_000));

  if (error) throw error;
}

export async function upsertSubscription(
  applicationId: string,
  value: Pick<
    Subscription,
    | "id"
    | "userId"
    | "skuIds"
    | "entitlementIds"
    | "renewalSkuIds"
    | "status"
    | "currentPeriodStartTimestamp"
    | "currentPeriodEndTimestamp"
    | "canceledTimestamp"
  >,
  observedAt: string,
  deleted = false,
): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase client not initialized");

  const { error } = await supabase
    .rpc("monetization_apply_subscription", {
      r: {
        applicationId,
        id: value.id,
        userId: value.userId,
        skuIds: value.skuIds,
        entitlementIds: value.entitlementIds,
        renewalSkuIds: value.renewalSkuIds,
        status: value.status,
        currentPeriodStart: new Date(
          value.currentPeriodStartTimestamp,
        ).toISOString(),
        currentPeriodEnd: new Date(
          value.currentPeriodEndTimestamp,
        ).toISOString(),
        canceledAt:
          value.canceledTimestamp == null
            ? null
            : new Date(value.canceledTimestamp).toISOString(),
        createdAt: createdAt(value.id),
        observedAt,
        deleted,
      },
    })
    .abortSignal(AbortSignal.timeout(12_000));

  if (error) throw error;
}

export async function getKnownPurchasers(
  applicationId: string,
  after?: string,
  limit = 100,
): Promise<string[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase client not initialized");

  const { data, error } = await supabase
    .rpc("monetization_known_purchasers", {
      app: applicationId,
      after_id: after ?? null,
      page_size: limit,
    })
    .abortSignal(AbortSignal.timeout(12_000));

  if (error) throw error;
  return data as string[];
}

export async function getSubscriptions(
  filter: RecordFilter,
): Promise<SubscriptionRecord[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase client not initialized");

  const { data, error } = await supabase
    .rpc("monetization_read_records", {
      kind: "subscriptions",
      app: filter.applicationId,
      usr: filter.userId ?? null,
      guild: filter.guildId ?? null,
      after_id: filter.after ?? null,
      page_size: filter.limit ?? 100,
    })
    .abortSignal(AbortSignal.timeout(12_000));

  if (error) throw error;
  return data as unknown as SubscriptionRecord[];
}

export async function getOneTimePurchases(
  filter: RecordFilter,
): Promise<OneTimePurchaseRecord[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase client not initialized");

  const { data, error } = await supabase
    .rpc("monetization_read_records", {
      kind: "one_time_purchases",
      app: filter.applicationId,
      usr: filter.userId ?? null,
      guild: filter.guildId ?? null,
      after_id: filter.after ?? null,
      page_size: filter.limit ?? 100,
    })
    .abortSignal(AbortSignal.timeout(12_000));

  if (error) throw error;
  return data as unknown as OneTimePurchaseRecord[];
}
