import { getSupabaseAdmin } from "../../client.ts";
import type { PurchaseFulfillment } from "../skuFulfillment.ts";

/** Reverse the original token grant, including tokens already spent. */
export async function removeTokens(
  applicationId: string,
  entitlementId: string,
): Promise<PurchaseFulfillment> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase client not initialized");

  const { data, error } = await supabase
    .rpc("monetization_remove_tokens", {
      app: applicationId,
      entitlement: entitlementId,
    })
    .abortSignal(AbortSignal.timeout(12_000));

  if (error) throw error;
  return data as unknown as PurchaseFulfillment;
}
