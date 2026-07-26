import { Guild } from "discord.js";
import { APIGuild, ExtendedClient } from "../types.ts";
import { getGuilds } from "../api/getGuilds.ts";
import {
  DBGetGuild,
  DBGuild,
  DBGuildWithSettings,
  DBUpsertGuild,
  ensureGuildTtsSettings,
  getOrCreateDBGuild,
} from "../../supabase/models/guilds.ts";
import ClientInstance from "./ClientInstance.ts";

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
        const extendedGuild = await getExtendedGuild(guild);

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
      pingSoundEnabled: true,
      femaleVoiceId: ClientInstance.femaleRoleId,
      maleVoiceId: ClientInstance.maleRoleId,
      ttsChannelName: ClientInstance.ttsChannelName,
      idleTimeout: ClientInstance.idleTimeout,
    },
    logging: {
      messageCount: 0,
      tokenTotalUsage: 0,
      tokenBalance: 5000,
      tokenLimit: 5000,
    },
  };
}

export async function getExtendedGuild(
  guild: APIGuild,
): Promise<DBGuildWithSettings> {
  let DBGuild = await DBGetGuild(guild.id);
  if (!DBGuild) {
    throw new Error(
      `Guild with ID ${guild.id} & name ${guild.name} not found in database.`,
    );
  }
  const settings = await ensureGuildTtsSettings(
    guild.id,
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
