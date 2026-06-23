import { Guild } from "discord.js";
import { ExtendedClient, ExtendedGuild } from "../types.ts";
import { getGuilds } from "../api/getGuilds.ts";
import client from "./client.ts";

export default async function setUpGuilds(
  client: ExtendedClient,
): Promise<string[]> {
  const guilds: ExtendedGuild[] = (await getGuilds(
    process.env.BOT_TOKEN!,
  )) as ExtendedGuild[];
  const guildIds: string[] = guilds.map((guild) => guild.id);
  guilds.map((guild) => {
    console.log(`Connected to guild: 🏯 ${guild.name} (ID: ${guild.id})`);
    setUpGuild(guild, {
      tts: {
        repliesEnabled: true,
        femaleVoiceId: client.femaleRoleId,
        maleVoiceId: client.maleRoleId,
        ttsChannelName: client.ttsChannelName,
        idleTimeout: client.idleTimeout,
      },
    });
    setUpGuildLogging(guild);
  });

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
