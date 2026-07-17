import type { Guild } from "discord.js";
import type { BotEvent, ExtendedClient } from "../../types.ts";
import { registerGuildCommands } from "./registerCommands.ts";
import { sendWelcomeMessage } from "./sendWelcome.ts";
import { setupGuildState } from "./setupGuild.ts";
import { syncGuildOwner } from "./syncOwner.ts";

const event: BotEvent<[Guild, ExtendedClient]> = {
  type: "guildCreate",
  execute: async (guild, client) => {
    try {
      console.log(`Joined guild: ${guild.name} (ID: ${guild.id})`);
      registerGuildCommands(client, guild.id);
      await sendWelcomeMessage(guild);
      await syncGuildOwner(guild);
      setupGuildState(guild, client);
    } catch (error) {
      console.error("Error in guildCreate event:", error);
    }
  },
};

export default event;
