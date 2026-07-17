import type { Guild } from "discord.js";
import type { ExtendedClient } from "../../types.ts";
import { setUpExtendedGuild } from "../../modules/setUpGuilds.ts";

export function setupGuildState(guild: Guild, client: ExtendedClient): void {
  setUpExtendedGuild(guild, client).catch((error) => {
    console.error(`Failed to set up guild ${guild.id} (${guild.name}):`, error);
  });
}
