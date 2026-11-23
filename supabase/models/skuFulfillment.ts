import { getSupabaseAdmin } from "../client.ts";
import type { Json } from "../types.ts";

export interface SkuAction {
  application_id: string;
  sku_id: string;
  enabled: boolean;
  mode: "once" | "while_active";
  grant_action: string;
  grant_settings: Record<string, Json | undefined>;
  remove_action: string;
  remove_settings: Record<string, Json | undefined>;
  effective_from: string;
  version: number;
  created_at: string;
  updated_at: string;
}

/** Replace the editable configuration; version and timestamps are database-owned. */
export type SkuActionInput = Omit<
  SkuAction,
  "version" | "created_at" | "updated_at"
>;

export interface FulfillmentTarget {
  type: "user" | "guild";
  id: string;
}

export interface PurchaseFulfillment {
  application_id: string;
  entitlement_id: string;
  sku_id: string;
  config_version: number;
  action_snapshot: Pick<
    SkuAction,
    | "mode"
    | "grant_action"
    | "grant_settings"
    | "remove_action"
    | "remove_settings"
  >;
  target_type: FulfillmentTarget["type"] | null;
  target_id: string | null;
  desired_state: "granted" | "removed";
  applied_state: "ungranted" | "granted" | "removed";
  processing_status:
    "pending" | "running" | "succeeded" | "failed" | "awaiting_recipient";
  operation_id: string;
  grant_result: Json | null;
  attempt_count: number;
  last_error: string | null;
  next_attempt_at: string | null;
  granted_at: string | null;
  removed_at: string | null;
  created_at: string;
  updated_at: string;
}

export async function upsertSkuAction(
  input: SkuActionInput,
): Promise<SkuAction> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase client not initialized");

  const { data, error } = await supabase
    .rpc("monetization_upsert_sku_action", { r: { ...input } })
    .abortSignal(AbortSignal.timeout(12_000));

  if (error) throw error;
  return data as unknown as SkuAction;
}

export async function getSkuAction(
  applicationId: string,
  skuId: string,
): Promise<SkuAction | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase client not initialized");

  const { data, error } = await supabase
    .rpc("monetization_get_sku_action", { app: applicationId, sku: skuId })
    .abortSignal(AbortSignal.timeout(12_000));

  if (error) throw error;
  return data as unknown as SkuAction | null;
}

/** Prepare state for an already-recorded purchase. This does not execute an action. */
export async function createPurchaseFulfillment(
  applicationId: string,
  entitlementId: string,
  target?: FulfillmentTarget,
): Promise<PurchaseFulfillment | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase client not initialized");

  const { data, error } = await supabase
    .rpc("monetization_create_purchase_fulfillment", {
      app: applicationId,
      entitlement: entitlementId,
      target_type: target?.type ?? null,
      target_id: target?.id ?? null,
    })
    .abortSignal(AbortSignal.timeout(12_000));

  if (error) throw error;
  return data as unknown as PurchaseFulfillment | null;
}

export async function getPurchaseFulfillment(
  applicationId: string,
  entitlementId: string,
): Promise<PurchaseFulfillment | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase client not initialized");

  const { data, error } = await supabase
    .rpc("monetization_get_purchase_fulfillment", {
      app: applicationId,
      entitlement: entitlementId,
    })
    .abortSignal(AbortSignal.timeout(12_000));

  if (error) throw error;
  return data as unknown as PurchaseFulfillment | null;
}
