import { Guild } from "discord.js";
import { ExtendedClient, ExtendedGuild } from "../types.ts";
import { getGuilds } from "../api/getGuilds.ts";
import client from "./client.ts";

export default async function setUpGuilds(
  client: ExtendedClient,
): Promise<string[]> {
  const guilds: Guild[] = (await getGuilds(process.env.BOT_TOKEN!)) as Guild[];
  const guildIds: string[] = guilds.map((guild) => guild.id);
  guilds.map((guild) => {
    console.log(`Connected to guild: 🏯 ${guild.name} (ID: ${guild.id})`);
    setUpGuild(guild as ExtendedGuild, {
      tts: {
        repliesEnabled: true,
        femaleVoiceId: client.femaleRoleId,
        maleVoiceId: client.maleRoleId,
        ttsChannelName: client.ttsChannelName,
        idleTimeout: client.idleTimeout,
      },
    });
  });

  const extendedGuilds: ExtendedGuild[] = guilds.map((guild) => {
    return guild as ExtendedGuild;
  });
  client.installedGuilds = extendedGuilds;

  return guildIds;
}

function setUpGuild(
  guild: ExtendedGuild,
  settings: ExtendedGuild["settings"],
): void {
  if (!guild.settings) {
    guild.settings = {
      tts: {
        repliesEnabled: true,
        femaleVoiceId: settings.tts.femaleVoiceId,
        maleVoiceId: settings.tts.maleVoiceId,
        ttsChannelName: settings.tts.ttsChannelName,
        idleTimeout: settings.tts.idleTimeout,
      },
    };
  }
}
