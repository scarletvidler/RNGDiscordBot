import { Guild } from "discord.js";
import { ExtendedClient, ExtendedGuild } from "../types.ts";
import { getGuilds } from "../api/getGuilds.ts";
import client from "./client.ts";
import {
  ensureGuildTtsSettings,
  upsertGuild,
} from "../../supabase/models/guilds.ts";

export default async function setUpGuilds(
  client: ExtendedClient,
): Promise<string[]> {
  const guilds: ExtendedGuild[] = (await getGuilds(
    process.env.BOT_TOKEN!,
  )) as ExtendedGuild[];
  const guildIds: string[] = guilds.map((guild) => guild.id);
  await Promise.all(
    guilds.map(async (guild) => {
    console.log(`Connected to guild: 🏯 ${guild.name} (ID: ${guild.id})`);
    const defaultSettings = {
      tts: {
        repliesEnabled: true,
        roomPrefixEnabled: false,
        femaleVoiceId: client.femaleRoleId,
        maleVoiceId: client.maleRoleId,
        ttsChannelName: client.ttsChannelName,
        idleTimeout: client.idleTimeout,
      },
    };

    try {
      await upsertGuild(guild);
      defaultSettings.tts = await ensureGuildTtsSettings(
        guild.id,
        defaultSettings.tts,
      );
    } catch (error) {
      console.error(`Failed to sync guild ${guild.id} with Supabase:`, error);
    }

    setUpGuild(guild, defaultSettings);
    setUpGuildLogging(guild);
    }),
  );

  const extendedGuilds: ExtendedGuild[] = guilds.map((guild) => {
    return guild as ExtendedGuild;
  });
  client.installedGuilds = extendedGuilds;

  return guildIds;
}

function setUpGuild(
  guild: Guild,
  settings: ExtendedGuild["settings"],
): ExtendedGuild {
  const extendedGuild = guild as ExtendedGuild;
  if (!extendedGuild.settings) {
    extendedGuild.settings = settings;
  }
  return extendedGuild;
}

function setUpGuildLogging(guild: ExtendedGuild): void {
  if (!guild.logging) {
    guild.logging = {
      messageCount: 0,
    };
  }
}
