import assert from "node:assert/strict";
import test from "node:test";
import type {
  DBGuildRuntimeState,
  DBGuildWithSettings,
} from "../../../supabase/models/guilds.ts";
import {
  GUILD_RUNTIME_CACHE_TTL_MS,
  refreshGuildRuntimeState,
} from "./guildRuntimeState.ts";

function createGuild(id: string): DBGuildWithSettings {
  return {
    id,
    has_active_subscription: false,
    settings: {
      logging: {
        message_count: 0,
        token_balance: 0,
        token_limit: 0,
        token_total_usage: 0,
      },
    },
  } as DBGuildWithSettings;
}

test("caches guild runtime data for one minute", async () => {
  const guild = createGuild("runtime-cache-test");
  let fetchCount = 0;
  const databaseGuild: DBGuildRuntimeState = {
    id: guild.id,
    has_active_subscription: true,
    token_limit: 10_000,
    token_total_usage: 2_500,
  };
  const fetchRuntimeState = async () => {
    fetchCount += 1;
    return databaseGuild;
  };

  await refreshGuildRuntimeState(guild, 100_000, fetchRuntimeState);
  await refreshGuildRuntimeState(
    guild,
    100_000 + GUILD_RUNTIME_CACHE_TTL_MS - 1,
    fetchRuntimeState,
  );

  assert.equal(fetchCount, 1);
  assert.equal(guild.has_active_subscription, true);
  assert.equal(guild.settings.logging.token_balance, 7_500);

  await refreshGuildRuntimeState(
    guild,
    100_000 + GUILD_RUNTIME_CACHE_TTL_MS,
    fetchRuntimeState,
  );
  assert.equal(fetchCount, 2);
});

test("deduplicates simultaneous guild refreshes", async () => {
  const guild = createGuild("runtime-in-flight-test");
  let fetchCount = 0;
  let finishFetch: (() => void) | undefined;
  const fetchFinished = new Promise<void>((resolve) => {
    finishFetch = resolve;
  });
  const fetchRuntimeState = async () => {
    fetchCount += 1;
    await fetchFinished;
    return {
      id: guild.id,
      has_active_subscription: false,
      token_limit: 10_000,
      token_total_usage: 0,
    };
  };

  const firstRefresh = refreshGuildRuntimeState(
    guild,
    200_000,
    fetchRuntimeState,
  );
  const secondRefresh = refreshGuildRuntimeState(
    guild,
    200_000,
    fetchRuntimeState,
  );
  finishFetch?.();
  await Promise.all([firstRefresh, secondRefresh]);

  assert.equal(fetchCount, 1);
});
