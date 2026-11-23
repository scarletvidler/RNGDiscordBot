import assert from "node:assert/strict";
import { test } from "node:test";
import { getSupabaseAdmin } from "../../supabase/client.ts";
import {
  upsertSkuAction,
  getSkuAction,
  createPurchaseFulfillment,
  getPurchaseFulfillment,
  type SkuActionInput,
} from "../../supabase/models/skuFulfillment.ts";

test("fulfillment models use the shared client, retain snapshots and surface errors", async (t) => {
  const oldUrl = process.env.SUPABASE_URL;
  const oldKey = process.env.SUPABASE_SECRET_KEY;
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SECRET_KEY = "test-secret";
  const client = getSupabaseAdmin()!;
  const originalRpc = client.rpc;
  const calls: Array<{ name: string; args: unknown }> = [];
  let response: { data: unknown; error: unknown } = { data: null, error: null };
  client.rpc = ((name: string, args: unknown) => ({
    abortSignal(signal: AbortSignal) {
      assert.ok(signal instanceof AbortSignal);
      calls.push({ name, args });
      return Promise.resolve(response);
    },
  })) as unknown as typeof client.rpc;
  t.after(() => {
    client.rpc = originalRpc;
    if (oldUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = oldKey;
  });
  const input: SkuActionInput = {
    application_id: "100",
    sku_id: "200",
    enabled: false,
    mode: "once",
    grant_action: "none",
    grant_settings: {},
    remove_action: "none",
    remove_settings: {},
    effective_from: "2026-11-12T00:00:00.000Z",
  };
  const saved = {
    ...input,
    version: 1,
    created_at: input.effective_from,
    updated_at: input.effective_from,
  };
  response.data = saved;
  assert.deepEqual(await upsertSkuAction(input), saved);
  assert.deepEqual(calls.at(-1), {
    name: "monetization_upsert_sku_action",
    args: { r: input },
  });
  assert.deepEqual(await getSkuAction("100", "200"), saved);
  assert.deepEqual(calls.at(-1), {
    name: "monetization_get_sku_action",
    args: { app: "100", sku: "200" },
  });
  response.data = null;
  assert.equal(await getSkuAction("100", "999"), null);
  assert.equal(await createPurchaseFulfillment("100", "600"), null);
  assert.deepEqual(calls.at(-1), {
    name: "monetization_create_purchase_fulfillment",
    args: {
      app: "100",
      entitlement: "600",
      target_type: null,
      target_id: null,
    },
  });
  response.data = {
    entitlement_id: "600",
    config_version: 1,
    operation_id: "saved-operation",
  };
  assert.deepEqual(
    await createPurchaseFulfillment("100", "600", { type: "guild", id: "400" }),
    response.data,
  );
  assert.deepEqual(calls.at(-1), {
    name: "monetization_create_purchase_fulfillment",
    args: {
      app: "100",
      entitlement: "600",
      target_type: "guild",
      target_id: "400",
    },
  });
  assert.deepEqual(await getPurchaseFulfillment("100", "600"), response.data);
  assert.deepEqual(calls.at(-1), {
    name: "monetization_get_purchase_fulfillment",
    args: { app: "100", entitlement: "600" },
  });
  const error = { code: "42501", message: "access denied" };
  response = { data: null, error };
  await assert.rejects(
    getPurchaseFulfillment("100", "600"),
    (value) => value === error,
  );
});
