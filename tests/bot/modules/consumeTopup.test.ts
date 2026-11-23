import assert from "node:assert/strict";
import { test } from "node:test";
import type { Client } from "discord.js";
import { getSupabaseAdmin } from "../../../supabase/client.ts";
import { consumeDeliveredTopup } from "../../../bot/modules/consumeTopup.ts";

test("consumption is acknowledged after Discord succeeds and recovers a lost response", async (t) => {
  const oldUrl = process.env.SUPABASE_URL;
  const oldKey = process.env.SUPABASE_SECRET_KEY;
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SECRET_KEY = "test-secret";
  const db = getSupabaseAdmin()!;
  const originalRpc = db.rpc;
  const calls: string[] = [];
  let consumed = false;
  let loseResponse = true;
  let deleted = false;
  db.rpc = ((name: string, args: unknown) => ({
    abortSignal: async () => {
      calls.push(name);
      assert.equal(name, "monetization_record_consumed_purchase");
      assert.deepEqual(args, { app: "100", entitlement: "200" });
      return { data: null, error: null };
    },
  })) as unknown as typeof db.rpc;
  const client = {
    application: {
      id: "100",
      entitlements: {
        fetch: async (options: unknown) => {
          calls.push("fetch");
          assert.deepEqual(options, {
            entitlement: "200",
            force: true,
            cache: false,
          });
          return { consumed, deleted };
        },
        consume: async (id: string) => {
          assert.equal(id, "200");
          calls.push("consume");
          consumed = true;
          if (loseResponse) throw new Error("response lost");
        },
      },
    },
  } as unknown as Client;
  t.after(() => {
    db.rpc = originalRpc;
    if (oldUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = oldKey;
  });

  await assert.rejects(
    consumeDeliveredTopup(client, "100", "200"),
    /response lost/,
  );
  assert.deepEqual(calls, ["fetch", "consume"]);
  calls.length = 0;
  await consumeDeliveredTopup(client, "100", "200");
  assert.deepEqual(calls, ["fetch", "monetization_record_consumed_purchase"]);
  calls.length = 0;
  consumed = false;
  loseResponse = false;
  await consumeDeliveredTopup(client, "100", "200");
  assert.deepEqual(calls, [
    "fetch",
    "consume",
    "monetization_record_consumed_purchase",
  ]);
  calls.length = 0;
  deleted = true;
  await consumeDeliveredTopup(client, "100", "200");
  assert.deepEqual(calls, ["fetch"]);
  await assert.rejects(
    consumeDeliveredTopup(client, "999", "200"),
    /application/,
  );
});
