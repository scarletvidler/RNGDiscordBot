import { Guild } from "discord.js";
import { APIGuild, ExtendedClient, ExtendedGuild } from "../types.ts";
import { getGuilds } from "../api/getGuilds.ts";
import {
  DBGetGuild,
  DBGuild,
  DBGuildWithSettings,
  ensureGuildTtsSettings,
  getOrCreateDBGuild,
} from "../../supabase/models/guilds.ts";
import { upsertDiscordUser } from "../../supabase/models/users.ts";
import { APIGetUserByGuild } from "../api/getUser.ts";
import invariant from "tiny-invariant";
import client from "./client.ts";

export default async function setUpGuilds(
  client: ExtendedClient,
): Promise<string[]> {
  client.installedGuilds = [];
  const guilds: APIGuild[] = (await getGuilds(
    process.env.BOT_TOKEN!,
  )) as APIGuild[];
  const guildIds: string[] = guilds.map((guild) => guild.id);
  await Promise.all(
    guilds.map(async (guild) => {
      console.log(`Connected to guild: 🏯 ${guild.name} (ID: ${guild.id})`);

      try {
        const extendedGuild = await getExtendedGuild(guild.id);

        // if client.installedGuilds does not already contain this guild, add it
        if (!client.installedGuilds.find((g) => g.id === guild.id)) {
          client.installedGuilds.push(extendedGuild);
        }
      } catch (error) {
        console.error(
          `Failed to set up guild ${guild.id} (${guild.name}):`,
          error,
        );
      }
    }),
  );

  return guildIds;
}

function setUpGuild(
  guild: DBGuild,
  settings: DBGuildWithSettings["settings"],
): DBGuildWithSettings {
  const extendedGuild = guild as DBGuildWithSettings;
  if (!extendedGuild.settings) {
    extendedGuild.settings = settings;
  }
  return extendedGuild;
}

function defaultGuildSettings() {
  return {
    tts: {
      repliesEnabled: true,
      roomPrefixEnabled: false,
      femaleVoiceId: client.femaleRoleId,
      maleVoiceId: client.maleRoleId,
      ttsChannelName: client.ttsChannelName,
      idleTimeout: client.idleTimeout,
    },
    logging: {
      messageCount: 0,
      tokenTotalUsage: 0,
      tokenBalance: 0,
      tokenLimit: 0,
    },
  };
}

export async function getExtendedGuild(
  guildId: string,
): Promise<DBGuildWithSettings> {
  const DBGuild = await DBGetGuild(guildId);
  if (!DBGuild) {
    console.error(`Guild with ID ${guildId} not found in database.`);
    throw new Error(`Guild with ID ${guildId} not found in database.`);
  }
  const settings = await ensureGuildTtsSettings(
    guildId,
    defaultGuildSettings().tts,
  );
  const extendedGuild: DBGuildWithSettings = {
    ...DBGuild,
    settings: {
      tts: settings,
      logging: {
        messageCount: DBGuild.message_count,
        tokenTotalUsage: DBGuild.token_total_usage,
        tokenBalance: DBGuild.token_balance,
        tokenLimit: DBGuild.token_limit,
      },
    },
  };

  return extendedGuild;
}

export async function setUpExtendedGuild(
  guild: Guild,
  client: ExtendedClient,
): Promise<DBGuildWithSettings> {
  const defaultSettings = defaultGuildSettings();

  try {
    const DBGuild = await getOrCreateDBGuild(guild);
    defaultSettings.tts = await ensureGuildTtsSettings(
      guild.id,
      defaultSettings.tts,
    );

    const extendedGuild: DBGuildWithSettings = {
      ...DBGuild,
      settings: defaultSettings,
    };

    client.installedGuilds.push(extendedGuild);

    return extendedGuild;
  } catch (error) {
    throw new Error(
      `Failed to sync guild ${guild.id} (${guild.name}) with Supabase`,
    );
  }
}
