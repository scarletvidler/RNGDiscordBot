import { getSupabaseAdmin } from "../client.ts";
import type { PurchaseFulfillment } from "./skuFulfillment.ts";

export async function redeemTopup(
  applicationId: string,
  entitlementId: string,
  buyerId: string,
  guildId: string,
): Promise<PurchaseFulfillment> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase client not initialized");

  const { data, error } = await supabase
    .rpc("monetization_redeem_topup", {
      app: applicationId,
      entitlement: entitlementId,
      buyer: buyerId,
      guild: guildId,
    })
    .abortSignal(AbortSignal.timeout(12_000));

  if (error) throw error;
  return data as unknown as PurchaseFulfillment;
}

export async function getSubscriptionEntitlements(
  applicationId: string,
  subscriptionId: string,
): Promise<string[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase client not initialized");

  const { data, error } = await supabase
    .rpc("monetization_get_subscription_entitlements", {
      app: applicationId,
      subscription: subscriptionId,
    })
    .abortSignal(AbortSignal.timeout(12_000));

  if (error) throw error;
  return data as string[];
}

export async function getPendingConsumptions(
  applicationId: string,
  after?: string,
  pageSize = 100,
): Promise<string[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase client not initialized");

  const { data, error } = await supabase
    .rpc("monetization_pending_consumptions", {
      app: applicationId,
      after_id: after,
      page_size: pageSize,
    })
    .abortSignal(AbortSignal.timeout(12_000));

  if (error) throw error;
  return data as string[];
}

/** Call only after Discord acknowledges consuming an already delivered top-up. */
export async function recordConsumedPurchase(
  applicationId: string,
  entitlementId: string,
): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase client not initialized");

  const { error } = await supabase
    .rpc("monetization_record_consumed_purchase", {
      app: applicationId,
      entitlement: entitlementId,
    })
    .abortSignal(AbortSignal.timeout(12_000));

  if (error) throw error;
}
