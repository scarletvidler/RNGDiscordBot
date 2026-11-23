import { getSupabaseAdmin } from "../../client.ts";
import type { PurchaseFulfillment } from "../skuFulfillment.ts";

/** Grant plan features and the current billing period's allowance once. */
export async function grantPlan(
  applicationId: string,
  entitlementId: string,
): Promise<PurchaseFulfillment> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase client not initialized");

  const { data, error } = await supabase
    .rpc("monetization_grant_plan", {
      app: applicationId,
      entitlement: entitlementId,
    })
    .abortSignal(AbortSignal.timeout(12_000));

  if (error) throw error;
  return data as unknown as PurchaseFulfillment;
}
