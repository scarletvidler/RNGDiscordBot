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

// export async function getExtendedGuild(
//   guild: Guild,
// ): Promise<DBGuildWithSettings> {
//   let DBGuild = await DBGetGuild(guild.id);
//   if (!DBGuild) {
//     console.log(
//       `DBGuild not found for guild ${guild.id} (${guild.name}). Creating new DBGuild entry.`,
//     );
//     DBGuild = await getOrCreateDBGuild(guild);
//   }
//   const settings = await ensureGuildTtsSettings(
//     guild.id,
//     defaultGuildSettings().tts,
//   );
//   const extendedGuild: DBGuildWithSettings = {
//     ...DBGuild,
//     settings: {
//       tts: settings,
//       logging: {
//         messageCount: DBGuild.message_count,
//         tokenTotalUsage: DBGuild.token_total_usage,
//         tokenBalance: DBGuild.token_balance,
//         tokenLimit: DBGuild.token_limit,
//       },
//     },
//   };

//   return extendedGuild;
// }

export async function setUpExtendedGuild(
  guild: Guild,
  client: ExtendedClient,
): Promise<DBGuildWithSettings> {
  try {
    const DBGuild = await getOrCreateDBGuild(guild);

    const TTSsettings = await ensureGuildTtsSettings(
      guild.id,
      defaultGuildSettings().tts,
    );
    const extendedGuild: DBGuildWithSettings = {
      ...DBGuild,
      settings: {
        tts: TTSsettings,
        logging: {
          messageCount: DBGuild.message_count,
          tokenTotalUsage: DBGuild.token_total_usage,
          tokenBalance: DBGuild.token_balance,
          tokenLimit: DBGuild.token_limit,
        },
      },
    };

    client.installedGuilds.push(extendedGuild);

    return extendedGuild;
  } catch (error) {
    console.error(
      `Error setting up extended guild for ${guild.id} (${guild.name}), dumping guild object:`,
    );
    console.log(guild);
    throw new Error(
      `Failed to sync guild ${guild.id} (${guild.name}) with Supabase`,
    );
  }
}
