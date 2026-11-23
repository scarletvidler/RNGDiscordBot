import type { Client } from "discord.js";
import type { ExtendedClient } from "../types.ts";
import {
  grantTokens,
  removeTokens,
  grantFeatures,
  removeFeatures,
  grantPlan,
  removePlan,
} from "../../supabase/models/fulfillmentActions.ts";
import { consumeDeliveredTopup } from "./consumeTopup.ts";
import {
  reconcilePurchaseFulfillment,
  recordFulfillmentFailure,
  completeNoopFulfillment,
} from "../../supabase/models/fulfillmentDispatch.ts";
import {
  invalidateGuildFeatures,
  refreshGuildFeatures,
} from "./featureCheck.ts";
import {
  invalidateGuildRuntimeState,
  refreshGuildRuntimeState,
} from "./tts/guildRuntimeState.ts";

/** Called inside the existing entitlement queue, never starts a nested queue. */
export async function dispatchFulfillment(
  client: Client,
  applicationId: string,
  entitlementId: string,
): Promise<void> {
  const fulfillment = await reconcilePurchaseFulfillment(
    applicationId,
    entitlementId,
  );
  if (
    !fulfillment ||
    fulfillment.target_type !== "guild" ||
    !fulfillment.target_id
  ) {
    return;
  }

  // Reconciliation already revoked access. A failed/delayed removal must not
  // leave a locally cached feature enabled while durable cleanup waits.
  if (fulfillment.desired_state === "removed") {
    invalidateGuildFeatures(applicationId, fulfillment.target_id);
  }

  const isPlan = fulfillment.action_snapshot.grant_action === "grant_plan";
  if (fulfillment.applied_state === fulfillment.desired_state) {
    if (fulfillment.applied_state === "granted") {
      await finishTopupConsumption(client, applicationId, fulfillment);
    }
    // A plan keeps its entitlement across monthly renewals. The database grants
    // each billing period once, including when this purchase was already delivered.
    if (!isPlan || fulfillment.desired_state !== "granted") return;
  }
  if (
    fulfillment.next_attempt_at &&
    Date.parse(fulfillment.next_attempt_at) > Date.now()
  ) {
    return;
  }

  const removing = fulfillment.desired_state === "removed";
  const action = removing
    ? fulfillment.action_snapshot.remove_action
    : fulfillment.action_snapshot.grant_action;
  let handler: typeof grantTokens | undefined;
  if (removing) {
    if (action === "remove_tokens") handler = removeTokens;
    if (action === "remove_features") handler = removeFeatures;
    if (action === "remove_plan") handler = removePlan;
  } else {
    if (action === "grant_tokens") handler = grantTokens;
    if (action === "grant_features") handler = grantFeatures;
    if (action === "grant_plan") handler = grantPlan;
  }

  try {
    if (action === "none") {
      await completeNoopFulfillment(applicationId, entitlementId);
    } else if (handler) {
      await handler(applicationId, entitlementId);
    } else {
      throw new Error("Unsupported fulfillment action");
    }
  } catch (error) {
    // Never persist raw provider/SQL errors, which can contain private data.
    await recordFulfillmentFailure(
      applicationId,
      entitlementId,
      fulfillment.operation_id,
      handler || action === "none" ? "handler_failed" : "unsupported_action",
    );
    throw error;
  }

  if (!removing) {
    await finishTopupConsumption(client, applicationId, fulfillment);
  }

  const guildId = fulfillment.target_id;
  invalidateGuildRuntimeState(guildId);
  const guild = (client as ExtendedClient).installedGuilds?.find(
    (installedGuild) => installedGuild.id === guildId,
  );

  // Delivery has committed. Cache refresh failures must not turn it into a failed grant.
  const cacheUpdates: Promise<unknown>[] = [
    refreshGuildFeatures(applicationId, guildId),
  ];
  if (guild) cacheUpdates.push(refreshGuildRuntimeState(guild));

  const results = await Promise.allSettled(cacheUpdates);
  if (results.some((result) => result.status === "rejected")) {
    console.error(
      "[monetization] fulfilled purchase cache refresh failed; next access will retry",
    );
  }
}

async function finishTopupConsumption(
  client: Client,
  applicationId: string,
  fulfillment: Awaited<ReturnType<typeof reconcilePurchaseFulfillment>>,
): Promise<void> {
  if (
    fulfillment?.action_snapshot.grant_action !== "grant_tokens" ||
    fulfillment.action_snapshot.grant_settings.redeem_to_guild !== true
  ) {
    return;
  }

  try {
    await consumeDeliveredTopup(
      client,
      applicationId,
      fulfillment.entitlement_id,
    );
  } catch {
    // Tokens have committed. Recovery will retry the Discord acknowledgement.
    console.error(
      "[monetization] top-up consumption will be retried by recovery",
    );
  }
}
