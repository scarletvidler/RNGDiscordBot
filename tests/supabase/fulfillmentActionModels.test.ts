import assert from "node:assert/strict";
import { test } from "node:test";
import { getSupabaseAdmin } from "../../supabase/client.ts";
import {
  grantTokens,
  removeTokens,
  grantFeatures,
  removeFeatures,
  getGrantedFeatures,
} from "../../supabase/models/fulfillmentActions.ts";

test("fulfillment action models send only purchase identity and propagate database failures", async (t) => {
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

  for (const [action, name] of [
    [grantTokens, "monetization_grant_tokens"],
    [removeTokens, "monetization_remove_tokens"],
    [grantFeatures, "monetization_grant_features"],
    [removeFeatures, "monetization_remove_features"],
  ] as const) {
    const saved = {
      application_id: "100",
      entitlement_id: "600",
      operation_id: "saved-operation",
    };
    response = { data: saved, error: null };
    assert.equal(await action("100", "600"), saved);
    assert.deepEqual(calls.at(-1), {
      name,
      args: { app: "100", entitlement: "600" },
    });
    const error = {
      code: "P0001",
      message: "Action does not match fulfillment",
    };
    response = { data: null, error };
    await assert.rejects(action("100", "600"), (value) => value === error);
  }

  response = { data: ["emotions", "voice_selection"], error: null };
  assert.deepEqual(
    await getGrantedFeatures("100", { type: "guild", id: "400" }),
    response.data,
  );
  assert.deepEqual(calls.at(-1), {
    name: "monetization_get_granted_features",
    args: { app: "100", target_type: "guild", target_id: "400" },
  });
  response.data = [];
  assert.deepEqual(
    await getGrantedFeatures("100", { type: "user", id: "300" }),
    [],
  );
  assert.deepEqual(calls.at(-1), {
    name: "monetization_get_granted_features",
    args: { app: "100", target_type: "user", target_id: "300" },
  });
  const error = { code: "42501", message: "access denied" };
  response = { data: null, error };
  await assert.rejects(
    getGrantedFeatures("100", { type: "guild", id: "400" }),
    (value) => value === error,
  );
});
