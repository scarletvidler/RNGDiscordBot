import assert from "node:assert/strict";
import test from "node:test";
import { PermissionFlagsBits } from "discord.js";
import command from "../../../bot/commands/config-leave-message.ts";
import { getSupabaseAdmin } from "../../../supabase/client.ts";

test("leave message command saves only its guild setting and updates live state after success", async (t) => {
  const oldUrl = process.env.SUPABASE_URL;
  const oldKey = process.env.SUPABASE_SECRET_KEY;
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SECRET_KEY = "test-secret";
  t.after(() => {
    if (oldUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = oldKey;
  });
  const db = getSupabaseAdmin()!;
  const guild = {
    id: "one",
    settings: { tts: { leave_message_enabled: true } },
  };
  const activeGuild = structuredClone(guild);
  const otherGuild = {
    id: "two",
    settings: { tts: { leave_message_enabled: true } },
  };
  let enabled = false;
  let failure = false;
  const writes: unknown[] = [];
  const replies: string[] = [];
  t.mock.method(db, "from", (table: string) => {
    assert.equal(table, "guild_tts_settings");
    return {
      upsert: (row: unknown) => {
        writes.push(row);
        return {
          select: () => ({
            single: async () => ({
              data: { guild_id: "one", leave_message_enabled: enabled },
              error: failure ? new Error("save failed") : null,
            }),
          }),
        };
      },
    };
  });
  const interaction = {
    deferReply: async () => {},
    editReply: async (text: string) => {
      replies.push(text);
    },
    options: {
      getBoolean: (name: string, required: boolean) => {
        assert.equal(name, "enabled");
        assert.equal(required, true);
        return enabled;
      },
    },
  };
  const client = {
    activeVoiceConnections: new Map([
      ["one", { DBGuild: activeGuild }],
      ["two", { DBGuild: otherGuild }],
    ]),
  };
  const execute = () =>
    command.execute(
      interaction as unknown as Parameters<typeof command.execute>[0],
      client as unknown as Parameters<typeof command.execute>[1],
      guild as unknown as Parameters<typeof command.execute>[2],
    );
  assert.deepEqual(command.requirements?.userPermissions, ["Administrator"]);
  assert.equal(
    command.data.toJSON().default_member_permissions,
    PermissionFlagsBits.Administrator.toString(),
  );
  await execute();
  assert.deepEqual(writes, [{ guild_id: "one", leave_message_enabled: false }]);
  assert.equal(guild.settings.tts.leave_message_enabled, false);
  assert.equal(activeGuild.settings.tts.leave_message_enabled, false);
  assert.equal(otherGuild.settings.tts.leave_message_enabled, true);
  assert.match(replies[0], /silently/);
  enabled = true;
  failure = true;
  await assert.rejects(execute, /save failed/);
  assert.equal(guild.settings.tts.leave_message_enabled, false);
  assert.equal(activeGuild.settings.tts.leave_message_enabled, false);
  assert.equal(replies.length, 1);
  failure = false;
  await execute();
  assert.equal(guild.settings.tts.leave_message_enabled, true);
  assert.equal(activeGuild.settings.tts.leave_message_enabled, true);
});
