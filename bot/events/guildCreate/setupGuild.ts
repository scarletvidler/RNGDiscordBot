import type { Guild } from "discord.js";
import type { ExtendedClient } from "../../types.ts";
import { setUpExtendedGuild } from "../../modules/setUpGuilds.ts";

export async function setupGuild(
  guild: Guild,
  client: ExtendedClient,
): Promise<boolean> {
  setUpExtendedGuild(guild, client).catch((error) => {
    console.error(`Failed to set up guild ${guild.id} (${guild.name}):`, error);
  });
  return false;
}
