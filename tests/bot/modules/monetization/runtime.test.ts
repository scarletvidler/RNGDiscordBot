import assert from "node:assert/strict";
import { test } from "node:test";
import type { Client } from "discord.js";
import { createDiscordMonetizationApi, startDiscordMonetization, stopDiscordMonetization } from "../../../../bot/modules/monetization/runtime.ts";
import entitlementUpdate from "../../../../bot/events/entitlementUpdate/index.event.ts";
import subscriptionUpdate from "../../../../bot/events/subscriptionUpdate/index.event.ts";

const app = "123456789012345678";
const sku = "223456789012345678";
type RestGet = Client["rest"]["get"];
function api(get: RestGet) {
  return createDiscordMonetizationApi({ rest: { get } as Client["rest"] }, app, new Set([sku]));
}

test("REST reads retry transient errors with a strict attempt bound and timeout signals", async () => {
  let attempts = 0;
  const transport = api(async (_route, options) => {
    attempts++;
    assert.ok(options?.signal instanceof AbortSignal);
    throw { status: 503, message: "sensitive response must not be logged" };
  });
  await assert.rejects(transport.listSkus());
  assert.equal(attempts, 3);
});

test("permanent REST errors are not retried", async () => {
  let attempts = 0;
  const transport = api(async () => { attempts++; throw { status: 403 }; });
  await assert.rejects(transport.getEntitlement("323456789012345678"));
  assert.equal(attempts, 1);
});

test("REST reconciliation explicitly includes expired/deleted records and user-scopes subscription reads", async () => {
  const requests: Array<{ route: string; query: URLSearchParams | undefined }> = [];
  const transport = api(async (route, options) => { requests.push({ route, query: options?.query }); return []; });
  await transport.listEntitlements("323456789012345678");
  await transport.listSubscriptions(sku, "423456789012345678");
  assert.equal(requests[0].query?.get("exclude_ended"), "false");
  assert.equal(requests[0].query?.get("exclude_deleted"), "false");
  assert.equal(requests[0].query?.get("sku_ids"), sku);
  assert.equal(requests[0].query?.get("after"), "323456789012345678");
  assert.equal(requests[1].query?.get("user_id"), "423456789012345678");
  assert.equal(requests[1].query?.get("limit"), "100");
});

test("disabled update adapters accept nullable old cache without starting a database or HTTP call", async () => {
  const previous = process.env.DISCORD_MONETIZATION_ENABLED;
  delete process.env.DISCORD_MONETIZATION_ENABLED;
  try {
    const client = { rest: { get: () => { throw new Error("Unexpected request"); } } } as unknown as Client;
    assert.equal(entitlementUpdate.type, "entitlementUpdate");
    assert.equal(subscriptionUpdate.type, "subscriptionUpdate");
    // Disabled records mode must be safe even before an application or user cache exists.
    await entitlementUpdate.execute(null, {} as never, client as never);
    await subscriptionUpdate.execute(null, {} as never, client as never);
    await startDiscordMonetization(client);
    await stopDiscordMonetization(client);
  } finally {
    if (previous === undefined) delete process.env.DISCORD_MONETIZATION_ENABLED;
    else process.env.DISCORD_MONETIZATION_ENABLED = previous;
  }
});
