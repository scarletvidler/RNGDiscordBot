import { Guild } from "discord.js";
import { BotEvent, ExtendedClient } from "../types.ts";
import { registerSlashCommands } from "../modules/registerSlashCommands.ts";

const event: BotEvent<[Guild, ExtendedClient]> = {
  type: "guildCreate",
  execute: async (guild, client: ExtendedClient) => {
    try {
      console.log(`Joined guild: ${guild.name} (ID: ${guild.id})`);
      registerSlashCommands(
        client,
        process.env.CLIENT_ID!,
        [guild.id],
        process.env.BOT_TOKEN!,
      );
    } catch (error) {
      console.error("Error in guildCreate event:", error);
    }
  },
};

export default event;
