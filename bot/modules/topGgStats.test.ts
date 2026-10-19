import assert from "node:assert/strict";
import test from "node:test";
import type { ExtendedClient } from "../types.ts";
import { getTopGgStats } from "./topGgStats.ts";

test("gets the server count from a non-sharded client's guild cache", async () => {
  const client = {
    shard: null,
    guilds: { cache: { size: 42 } },
    ws: { shards: { size: 1 } },
  } as unknown as ExtendedClient;

  await assert.doesNotReject(async () => {
    assert.deepEqual(await getTopGgStats(client), {
      serverCount: 42,
      shardCount: 1,
    });
  });
});

test("adds the guild counts from every shard", async () => {
  const client = {
    shard: {
      count: 3,
      fetchClientValues: async () => [10, 20, 12],
    },
  } as unknown as ExtendedClient;

  assert.deepEqual(await getTopGgStats(client), {
    serverCount: 42,
    shardCount: 3,
  });
});

test("rejects incomplete shard counts instead of reporting a wrong total", async () => {
  const client = {
    shard: {
      count: 3,
      fetchClientValues: async () => [10, 20],
    },
  } as unknown as ExtendedClient;

  await assert.rejects(
    getTopGgStats(client),
    /invalid guild counts for one or more shards/,
  );
});
