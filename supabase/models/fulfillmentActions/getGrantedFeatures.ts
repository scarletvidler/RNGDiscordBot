import { getSupabaseAdmin } from "../../client.ts";
import type { FulfillmentTarget } from "../skuFulfillment.ts";

export async function getGrantedFeatures(
  applicationId: string,
  target: FulfillmentTarget,
): Promise<string[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase client not initialized");

  const { data, error } = await supabase
    .rpc("monetization_get_granted_features", {
      app: applicationId,
      target_type: target.type,
      target_id: target.id,
    })
    .abortSignal(AbortSignal.timeout(12_000));

  if (error) throw error;
  return data as string[];
}
