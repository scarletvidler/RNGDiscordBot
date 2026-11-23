import assert from "node:assert/strict";
import { test } from "node:test";
import {
  Collection,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from "discord.js";
import command from "../../../bot/commands/tokens-redeem.ts";
import type { ExtendedClient } from "../../../bot/types.ts";
import type { DBGuildWithSettings } from "../../../supabase/models/guilds.ts";

test("token redemption requires Manage Server and searches only the invoking buyer", async () => {
  let allowed = false;
  const messages: string[] = [];
  const queries: unknown[] = [];
  const interaction = {
    guildId: "700",
    user: { id: "300" },
    memberPermissions: {
      has: (permission: bigint) => {
        assert.equal(permission, PermissionFlagsBits.ManageGuild);
        return allowed;
      },
    },
    reply: async (response: { content: string }) => {
      messages.push(response.content);
    },
    deferReply: async () => {},
    editReply: async (content: string) => {
      messages.push(content);
    },
  } as unknown as ChatInputCommandInteraction;
  const client = {
    application: {
      id: "100",
      entitlements: {
        fetch: async (options: unknown) => {
          queries.push(options);
          return new Collection();
        },
      },
    },
  } as unknown as ExtendedClient;
  const guild = { id: "700" } as DBGuildWithSettings;
  await command.execute(interaction, client, guild);
  assert.equal(queries.length, 0);
  assert.match(messages[0], /Manage Server/);
  allowed = true;
  await command.execute(interaction, client, guild);
  assert.equal((queries[0] as { user: string }).user, "300");
  assert.match(messages[1], /No unclaimed token packs/);
});
