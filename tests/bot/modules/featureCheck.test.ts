import assert from "node:assert/strict";
import { test } from "node:test";
import type { ChatInputCommandInteraction, Guild } from "discord.js";
import { getSupabaseAdmin } from "../../../supabase/client.ts";
import {
  GUILD_FEATURE_CACHE_TTL_MS,
  guildHasFeature,
  invalidateGuildFeatures,
  loadGuildFeatures,
  refreshGuildFeatures,
} from "../../../bot/modules/featureCheck.ts";
import { executeCommandSafely } from "../../../bot/events/interactionCreate/executeCommand.ts";
import type { BotCommand, ExtendedClient } from "../../../bot/types.ts";
import { setUpExtendedGuild } from "../../../bot/modules/startGuilds.ts";

type Reply = { data: string[] | null; error: Error | null };

function deferred() {
  let resolve!: (value: Reply) => void;
  const promise = new Promise<Reply>((done) => (resolve = done));
  return { promise, resolve };
}

test("guild feature cache scopes, refreshes and fails closed", async (t) => {
  const oldUrl = process.env.SUPABASE_URL;
  const oldKey = process.env.SUPABASE_SECRET_KEY;
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SECRET_KEY = "test-secret";
  const db = getSupabaseAdmin()!;
  const originalRpc = db.rpc;
  const originalFrom = db.from;
  const originalNow = Date.now;
  let now = 1000;
  Date.now = () => now;
  const calls: unknown[] = [];
  let nextReply: () => Promise<Reply> = async () => ({
    data: ["emotions", "voice_selection"],
    error: null,
  });
  db.rpc = ((name: string, args: unknown) => ({
    abortSignal() {
      assert.equal(name, "monetization_get_granted_features");
      calls.push(args);
      return nextReply();
    },
  })) as unknown as typeof db.rpc;
  db.from = (() => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({ data: { is_banned: false }, error: null }),
      }),
    }),
  })) as unknown as typeof db.from;
  t.after(() => {
    db.rpc = originalRpc;
    db.from = originalFrom;
    Date.now = originalNow;
    if (oldUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = oldKey;
  });

  await t.test(
    "preloads, caches all-of checks and isolates application and guild",
    async () => {
      const loaded = await loadGuildFeatures("100", "400");
      assert.deepEqual([...loaded], ["emotions", "voice_selection"]);
      assert.equal(await guildHasFeature("100", "400", "emotions"), true);
      assert.equal(
        await guildHasFeature("100", "400", ["emotions", "voice_selection"]),
        true,
      );
      assert.equal(
        await guildHasFeature("100", "400", ["emotions", "missing"]),
        false,
      );
      assert.equal(calls.length, 1);
      assert.deepEqual(calls[0], {
        app: "100",
        target_type: "guild",
        target_id: "400",
      });
      (loaded as Set<string>).add("fake");
      assert.equal(await guildHasFeature("100", "400", "fake"), false);
      nextReply = async () => ({ data: [], error: null });
      assert.equal(await guildHasFeature("101", "400", "emotions"), false);
      assert.equal(await guildHasFeature("100", "401", "emotions"), false);
      assert.equal(calls.length, 3);
    },
  );

  await t.test("expiry and forced refresh replace cached grants", async () => {
    now += GUILD_FEATURE_CACHE_TTL_MS;
    assert.equal(await guildHasFeature("100", "400", "emotions"), false);
    nextReply = async () => ({ data: ["emotions"], error: null });
    await refreshGuildFeatures("100", "400");
    assert.equal(await guildHasFeature("100", "400", "emotions"), true);
    nextReply = async () => ({ data: [], error: null });
    invalidateGuildFeatures("100", "400");
    assert.equal(await guildHasFeature("100", "400", "emotions"), false);
  });

  await t.test(
    "read failures never reuse expired or invalidated access and can recover",
    async () => {
      nextReply = async () => ({ data: ["emotions"], error: null });
      await refreshGuildFeatures("100", "402");
      nextReply = async () => ({
        data: null,
        error: new Error("database unavailable"),
      });
      now += GUILD_FEATURE_CACHE_TTL_MS;
      assert.equal(await guildHasFeature("100", "402", "emotions"), false);
      await assert.rejects(
        refreshGuildFeatures("100", "402"),
        /database unavailable/,
      );
      assert.equal(await guildHasFeature("100", "402", "emotions"), false);
      nextReply = async () => ({ data: ["emotions"], error: null });
      assert.equal(await guildHasFeature("100", "402", "emotions"), true);
      assert.equal(await guildHasFeature("", "402", "emotions"), false);
    },
  );

  await t.test(
    "shared reads deduplicate and an old in-flight result cannot undo invalidation",
    async () => {
      const oldRead = deferred();
      nextReply = () => oldRead.promise;
      const before = calls.length;
      const first = guildHasFeature("100", "403", "emotions");
      const second = guildHasFeature("100", "403", "emotions");
      assert.equal(calls.length, before + 1);
      const newRead = deferred();
      nextReply = () => newRead.promise;
      const refreshed = refreshGuildFeatures("100", "403");
      assert.equal(calls.length, before + 2);
      oldRead.resolve({ data: ["emotions"], error: null });
      newRead.resolve({ data: [], error: null });
      assert.deepEqual([...(await refreshed)], []);
      assert.equal(await first, false);
      assert.equal(await second, false);
      assert.equal(await guildHasFeature("100", "403", "emotions"), false);
      assert.equal(calls.length, before + 2);
    },
  );

  await t.test(
    "guild loading preloads features and retains installation on read failure",
    async () => {
      const commandFrom = db.from;
      db.from = ((table: string) =>
        table === "guilds"
          ? {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: {
                      id: "405",
                      token_limit: 5000,
                      token_total_usage: 0,
                    },
                    error: null,
                  }),
                }),
              }),
            }
          : {
              upsert: () => ({
                select: () => ({
                  single: async () => ({
                    data: { guild_id: "405" },
                    error: null,
                  }),
                }),
              }),
            }) as unknown as typeof db.from;
      try {
        const client = {
          application: { id: "100" },
          installedGuilds: [],
        } as unknown as ExtendedClient;
        const guild = { id: "405", name: "test guild" } as Guild;
        nextReply = async () => ({ data: ["emotions"], error: null });
        await setUpExtendedGuild(guild, client);
        const before = calls.length;
        assert.equal(await guildHasFeature("100", "405", "emotions"), true);
        assert.equal(calls.length, before);
        nextReply = async () => ({
          data: null,
          error: new Error("unavailable"),
        });
        await setUpExtendedGuild(guild, client);
        assert.equal(client.installedGuilds.length, 1);
        assert.equal(await guildHasFeature("100", "405", "emotions"), false);
      } finally {
        db.from = commandFrom;
      }
    },
  );

  await t.test(
    "commands with declared requirements use the cache and fail closed",
    async () => {
      nextReply = async () => ({ data: [], error: null });
      const replies: unknown[] = [];
      let executions = 0;
      const interaction = {
        applicationId: "100",
        guildId: "404",
        reply: async (reply: unknown) => {
          replies.push(reply);
        },
      } as unknown as ChatInputCommandInteraction;
      const client = {
        installedGuilds: [{ id: "404" }],
        activeVoiceConnections: new Map(),
      } as unknown as ExtendedClient;
      const command = {
        requirements: { guildFeatures: ["emotions"] },
        execute: async () => {
          executions++;
        },
      } as unknown as BotCommand;
      await executeCommandSafely(interaction, command, client);
      assert.equal(executions, 0);
      assert.equal(replies.length, 1);
      nextReply = async () => ({ data: ["emotions"], error: null });
      await refreshGuildFeatures("100", "404");
      await executeCommandSafely(interaction, command, client);
      assert.equal(executions, 1);
      nextReply = async () => ({ data: null, error: new Error("unavailable") });
      invalidateGuildFeatures("100", "404");
      await executeCommandSafely(interaction, command, client);
      assert.equal(executions, 1);
      command.requirements = undefined;
      const before = calls.length;
      await executeCommandSafely(interaction, command, client);
      assert.equal(executions, 2);
      assert.equal(calls.length, before);
    },
  );
});
