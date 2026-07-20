import { Guild } from "discord.js";
import { APIGuild, ExtendedClient } from "../types.ts";
import { getGuilds } from "../api/getGuilds.ts";
import {
  DBGetGuild,
  DBGuild,
  DBGuildWithSettings,
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
      femaleVoiceId: ClientInstance.femaleRoleId,
      maleVoiceId: ClientInstance.maleRoleId,
      ttsChannelName: ClientInstance.ttsChannelName,
      idleTimeout: ClientInstance.idleTimeout,
    },
    logging: {
      messageCount: 0,
      tokenTotalUsage: 0,
      tokenBalance: 10000,
      tokenLimit: 10000,
    },
  };
}

export async function getExtendedGuild(
  guildId: string,
): Promise<DBGuildWithSettings> {
  const DBGuild = await DBGetGuild(guildId);
  if (!DBGuild) {
    console.error(`Guild with ID ${guildId} not found in database.`);
    return setUpGuild(
      {
        id: guildId,
        name: "Unknown Guild",
        owner_id: "Unknown Owner",
        joined_at: new Date().toISOString(),
        left_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        message_count: 0,
        token_total_usage: 0,
        token_balance: 10000,
        token_limit: 10000,
      },
      defaultGuildSettings(),
    );
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
