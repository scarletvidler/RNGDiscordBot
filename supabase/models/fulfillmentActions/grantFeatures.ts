import { getSupabaseAdmin } from "../../client.ts";
import type { PurchaseFulfillment } from "../skuFulfillment.ts";

/** Grant the features saved on this purchase. */
export async function grantFeatures(
  applicationId: string,
  entitlementId: string,
): Promise<PurchaseFulfillment> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase client not initialized");

  const { data, error } = await supabase
    .rpc("monetization_grant_features", {
      app: applicationId,
      entitlement: entitlementId,
    })
    .abortSignal(AbortSignal.timeout(12_000));

  if (error) throw error;
  return data as unknown as PurchaseFulfillment;
}
