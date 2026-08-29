import type { Guild } from "discord.js";
import type { APIGuild, ExtendedClient } from "../types.ts";
import { getGuilds } from "../api/getGuilds.ts";
import {
  DBUpsertGuildTTSSettings,
  getOrCreateDBGuild,
} from "../../supabase/models/guilds.ts";
import type { DBGuildWithSettings } from "../../supabase/models/guilds.ts";

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

export async function setUpExtendedGuild(
  guild: Guild,
  client: ExtendedClient,
): Promise<DBGuildWithSettings> {
  try {
    const DBGuild = await getOrCreateDBGuild(guild);

    // Supplying only the conflict key creates a missing settings row using
    // database defaults without overwriting an existing guild's choices.
    const TTSsettings = await DBUpsertGuildTTSSettings({ guild_id: guild.id });
    const extendedGuild: DBGuildWithSettings = {
      ...DBGuild,
      users: [], // Initialize users as an empty array; you may want to populate this based on your application's logic
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

    const existingGuildIndex = client.installedGuilds.findIndex(
      (installedGuild) => installedGuild.id === guild.id,
    );

    if (existingGuildIndex === -1) {
      client.installedGuilds.push(extendedGuild);
    } else {
      // Refresh the existing cache entry instead of leaving stale duplicates.
      // Preserve cached users because they are populated lazily at runtime.
      extendedGuild.users = client.installedGuilds[existingGuildIndex].users;
      client.installedGuilds[existingGuildIndex] = extendedGuild;
    }

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
