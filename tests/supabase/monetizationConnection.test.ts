import assert from "node:assert/strict";
import test from "node:test";
import {
  createMonetizationModels,
  createMonetizationStore,
} from "../../supabase/models/monetization.ts";
import { getSupabaseAdmin } from "../../supabase/client.ts";

test("RPC errors propagate and later operations can recover", async () => {
  let attempts = 0;
  const failure = { code: "503", message: "unavailable" };
  const store = createMonetizationModels({
    async rpc(name, args) {
      assert.equal(name, "monetization_known_purchasers");
      assert.deepEqual(args, { app: "100", after_id: null, page_size: 100 });
      if (++attempts === 1) return { data: null, error: failure };
      return { data: ["300"], error: null };
    },
  });
  await assert.rejects(
    store.listKnownPurchasers("100"),
    (error) => error === failure,
  );
  assert.deepEqual(await store.listKnownPurchasers("100"), ["300"]);
});

test("monetization uses the shared Supabase admin client with no extra credentials", async () => {
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SECRET_KEY;
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SECRET_KEY = "test-secret";
  const client = getSupabaseAdmin()!;
  const originalRpc = client.rpc;
  const calls: unknown[] = [];
  client.rpc = ((name: string, args: unknown) => {
    calls.push({ name, args });
    return {
      abortSignal(signal: AbortSignal) {
        assert.ok(signal instanceof AbortSignal);
        return Promise.resolve({ data: ["300"], error: null });
      },
    };
  }) as unknown as typeof client.rpc;
  try {
    assert.deepEqual(
      await createMonetizationStore().listKnownPurchasers("100"),
      ["300"],
    );
    assert.deepEqual(calls, [
      {
        name: "monetization_known_purchasers",
        args: { app: "100", after_id: null, page_size: 100 },
      },
    ]);
  } finally {
    client.rpc = originalRpc;
    if (previousUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = previousKey;
  }
});
