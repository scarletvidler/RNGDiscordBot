import assert from "node:assert/strict";
import test from "node:test";
import { createRestrictedQueryClient } from "../../supabase/models/monetization.ts";

test("a transient login-check failure coalesces and can recover on the next operation", async () => {
  let checks = 0;
  let writes = 0;
  const client = createRestrictedQueryClient({
    async query(text) {
      if (text === "record purchase") {
        writes++;
        return { rows: [{ result: "recorded" }] };
      }
      checks++;
      if (checks === 1) throw new Error("Temporary connection failure");
      return { rows: [{ result: true }] };
    },
  });

  const failed = await Promise.allSettled([
    client.query("record purchase", []),
    client.query("record purchase", []),
  ]);
  assert(failed.every((result) => result.status === "rejected"));
  assert.equal(checks, 1);
  assert.equal(writes, 0);

  await client.query("record purchase", []);
  await client.query("record purchase", []);
  assert.equal(checks, 2);
  assert.equal(writes, 2);
});

test("an unauthorized login never reaches record queries even when retried", async () => {
  let calls = 0;
  const client = createRestrictedQueryClient({
    async query() {
      calls++;
      return { rows: [{ result: false }] };
    },
  });
  await assert.rejects(
    client.query("record purchase", []),
    /restricted writer/,
  );
  await assert.rejects(
    client.query("record purchase", []),
    /restricted writer/,
  );
  assert.equal(calls, 2);
});
