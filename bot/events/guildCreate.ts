import { Guild } from "discord.js";
import { BotEvent, ExtendedClient } from "../types.ts";

const event: BotEvent<[Guild, ExtendedClient]> = {
  type: "guildCreate",
  execute: async (guild, client: ExtendedClient) => {
    try {
      console.log(`Joined guild: ${guild.name} (ID: ${guild.id})`);
    } catch (error) {
      console.error("Error in guildCreate event:", error);
    }
  },
};

export default event;
