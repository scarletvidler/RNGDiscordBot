import { getSupabaseAdmin } from "../client.ts";
import type { PurchaseFulfillment } from "./skuFulfillment.ts";

export async function reconcilePurchaseFulfillment(
  applicationId: string,
  entitlementId: string,
): Promise<PurchaseFulfillment | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase client not initialized");

  const { data, error } = await supabase
    .rpc("monetization_reconcile_fulfillment", {
      app: applicationId,
      entitlement: entitlementId,
    })
    .abortSignal(AbortSignal.timeout(12_000));

  if (error) throw error;
  return data as unknown as PurchaseFulfillment | null;
}

export async function getFulfillmentEntitlements(
  applicationId: string,
  after?: string,
  pageSize = 100,
): Promise<string[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase client not initialized");

  const { data, error } = await supabase
    .rpc("monetization_fulfillment_entitlements", {
      app: applicationId,
      after_id: after,
      page_size: pageSize,
    })
    .abortSignal(AbortSignal.timeout(12_000));

  if (error) throw error;
  return data as string[];
}

export async function recordFulfillmentFailure(
  applicationId: string,
  entitlementId: string,
  operationId: string,
  errorCode: "handler_failed" | "unsupported_action",
): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase client not initialized");

  const { error } = await supabase
    .rpc("monetization_fulfillment_failure", {
      app: applicationId,
      entitlement: entitlementId,
      operation: operationId,
      error_code: errorCode,
    })
    .abortSignal(AbortSignal.timeout(12_000));

  if (error) throw error;
}

export async function completeNoopFulfillment(
  applicationId: string,
  entitlementId: string,
): Promise<PurchaseFulfillment> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase client not initialized");

  const { data, error } = await supabase
    .rpc("monetization_complete_noop_fulfillment", {
      app: applicationId,
      entitlement: entitlementId,
    })
    .abortSignal(AbortSignal.timeout(12_000));

  if (error) throw error;
  return data as unknown as PurchaseFulfillment;
}
