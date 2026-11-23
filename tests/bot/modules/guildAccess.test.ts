import assert from "node:assert/strict";
import { test } from "node:test";
import { getSupabaseAdmin } from "../../../supabase/client.ts";
import { canGuildUseLerche } from "../../../bot/modules/guildAccess.ts";
import { executeCommandSafely } from "../../../bot/events/interactionCreate/executeCommand.ts";
import messageEvent from "../../../bot/events/messageCreate/index.event.ts";
import type { BotCommand, ExtendedClient } from "../../../bot/types.ts";
import type { ChatInputCommandInteraction, Message } from "discord.js";

test("fresh guild bans block commands/messages, disconnect voice, and allow unbans", async (t) => {
  const oldUrl = process.env.SUPABASE_URL;
  const oldKey = process.env.SUPABASE_SECRET_KEY;
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SECRET_KEY = "test-secret";
  const db = getSupabaseAdmin()!;
  const originalFrom = db.from;
  let banned = true;
  let failure: Error | null = null;
  db.from = ((table: string) => {
    assert.equal(table, "guilds");
    return {
      select(column: string) {
        assert.equal(column, "is_banned");
        return {
          eq(key: string, id: string) {
            assert.equal(key, "id");
            assert.equal(id, "guild");
            return {
              maybeSingle: async () => ({
                data: { is_banned: banned },
                error: failure,
              }),
            };
          },
        };
      },
    };
  }) as unknown as typeof db.from;
  t.after(() => {
    db.from = originalFrom;
    if (oldUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = oldKey;
  });
  let destroyed = 0;
  const guild = { id: "guild", is_banned: false };
  const client = {
    installedGuilds: [guild],
    activeVoiceConnections: new Map([
      [
        "guild",
        {
          destroy: async (options: unknown) => {
            assert.deepEqual(options, {
              destroyConnection: true,
              playDisconnectSound: false,
            });
            destroyed++;
          },
        },
      ],
    ]),
  } as unknown as ExtendedClient;
  let executed = 0;
  const replies: unknown[] = [];
  const interaction = {
    guildId: "guild",
    reply: async (reply: unknown) => {
      replies.push(reply);
    },
  } as unknown as ChatInputCommandInteraction;
  const command = {
    execute: async () => {
      executed++;
    },
  } as unknown as BotCommand;
  await executeCommandSafely(interaction, command, client);
  assert.equal(executed, 0);
  assert.equal(replies.length, 1);
  assert.equal(guild.is_banned, true);
  // No channel/permissions/TTS members: reaching downstream message processing would throw.
  let channelAccessed = false;
  await messageEvent.execute(
    {
      author: { bot: false },
      inGuild: () => true,
      guildId: "guild",
      get channel() {
        channelAccessed = true;
        throw new Error("Banned message reached downstream processing");
      },
    } as unknown as Message,
    client,
  );
  assert.equal(destroyed, 2);
  assert.equal(channelAccessed, false);
  banned = false;
  await executeCommandSafely(interaction, command, client);
  assert.equal(executed, 1);
  assert.equal(guild.is_banned, false);
  failure = new Error("Database unavailable");
  await assert.rejects(
    canGuildUseLerche("guild", client),
    /Database unavailable/,
  );
  await executeCommandSafely(interaction, command, client);
  assert.equal(executed, 1);
});
