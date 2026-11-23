import type { Client } from "discord.js";
import { recordConsumedPurchase } from "../../supabase/models/planPurchases.ts";

/** Called only after durable token delivery, under the entitlement's queue key. */
export async function consumeDeliveredTopup(
  client: Client,
  applicationId: string,
  entitlementId: string,
): Promise<void> {
  const application = client.application;
  if (application?.id !== applicationId) {
    throw new Error("Discord application is not ready");
  }

  // A previous consume may have succeeded even if its response was lost.
  const entitlement = await application.entitlements.fetch({
    entitlement: entitlementId,
    force: true,
    cache: false,
  });
  if (entitlement.deleted) return;
  if (!entitlement.consumed) {
    await application.entitlements.consume(entitlementId);
  }

  await recordConsumedPurchase(applicationId, entitlementId);
}
