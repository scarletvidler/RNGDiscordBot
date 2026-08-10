import { Guild } from "discord.js";
import { APIGuild, ExtendedClient } from "../types.ts";
import { DBUpsertGuildTTSSettings } from "../../supabase/models/guilds.ts";
import { getGuilds } from "../api/getGuilds.ts";
import {
  DBGuildWithSettings,
  getOrCreateDBGuild,
} from "../../supabase/models/guilds.ts";
import ClientInstance from "./ClientInstance.ts";

export default async function startGuilds(
  client: ExtendedClient,
): Promise<string[]> {
  try {
    client.installedGuilds = [];
    const APIGuilds: APIGuild[] = await getGuilds(process.env.BOT_TOKEN!);
    await Promise.all(
      APIGuilds.map(async (guild) => {
        try {
          console.log(
            `Attempting to connect to guild: 🏯 ${guild.name} (ID: ${guild.id})`,
          );
          const fetchedGuild = await client.guilds.fetch(guild.id);
          await setUpExtendedGuild(fetchedGuild, client);
        } catch (error) {
          console.error(`Failed to fetch ${guild.id} (${guild.name}):`, error);
        }
      }),
    );

    return client.installedGuilds.map((guild) => guild.id);
  } catch (error) {
    throw new Error("Failed to start guilds", { cause: error });
  }
}

function defaultGuildSettings() {
  return {
    tts: {
      repliesEnabled: true,
      roomPrefixEnabled: false,
      pingSoundEnabled: true,
      sayUsersName: false,
      elevenlabs_female_voice_id: ClientInstance.femaleRoleId,
      elevenlabs_male_voice_id: ClientInstance.maleRoleId,
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

export async function setUpExtendedGuild(
  guild: Guild,
  client: ExtendedClient,
): Promise<DBGuildWithSettings> {
  try {
    const DBGuild = await getOrCreateDBGuild(guild);

    const TTSsettings = await DBUpsertGuildTTSSettings({
      guild_id: guild.id,
      replies_enabled: true,
      room_prefix_enabled: false,
      tts_ping_sound_enabled: true,
      tts_say_users_name: false,
      elevenlabs_female_voice_id: ClientInstance.femaleRoleId,
      elevenlabs_male_voice_id: ClientInstance.maleRoleId,
      tts_channel_name: ClientInstance.ttsChannelName,
      idle_timeout_seconds: ClientInstance.idleTimeout,
    });
    const extendedGuild: DBGuildWithSettings = {
      ...DBGuild,
      settings: {
        tts: TTSsettings,
        logging: {
          message_count: DBGuild.message_count,
          token_total_usage: DBGuild.token_total_usage,
          token_balance: DBGuild.token_balance,
          token_limit: DBGuild.token_limit,
        },
      },
    };

    client.installedGuilds.push(extendedGuild);

    return extendedGuild;
  } catch (error) {
    console.error(error);
    console.error(
      `Error setting up extended guild for ${guild.id} (${guild.name}), dumping guild object:`,
    );
    console.log(guild);
    throw new Error(
      `Failed to sync guild ${guild.id} (${guild.name}) with Supabase`,
    );
  }
}
