import { getSupabaseAdmin } from "../../client.ts";
import type { PurchaseFulfillment } from "../skuFulfillment.ts";

/** End plan access and remove the applicable plan allowance. */
export async function removePlan(
  applicationId: string,
  entitlementId: string,
): Promise<PurchaseFulfillment> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase client not initialized");

  const { data, error } = await supabase
    .rpc("monetization_remove_plan", {
      app: applicationId,
      entitlement: entitlementId,
    })
    .abortSignal(AbortSignal.timeout(12_000));

  if (error) throw error;
  return data as unknown as PurchaseFulfillment;
}
