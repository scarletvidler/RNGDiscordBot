import type { Guild } from "discord.js";
import type { BotEvent, ExtendedClient } from "../../types.ts";
import { registerGuildCommands } from "./registerCommands.ts";
import { sendWelcomeMessage } from "./sendWelcome.ts";
import { setupGuild } from "./setupGuild.ts";
import { setupUser } from "./setupUser.ts";
import { APIGetUserByGuild } from "../../api/getUser.ts";

const event: BotEvent<[Guild, ExtendedClient]> = {
  type: "guildCreate",
  execute: async (guild, extendedClient) => {
    try {
      console.log(`Joined guild: ${guild.name} (ID: ${guild.id})`);
      registerGuildCommands(extendedClient, guild.id);
      await sendWelcomeMessage(guild);
      const user = await APIGetUserByGuild(guild);
      if (user) await setupUser(user);
      await setupGuild(guild, extendedClient);
    } catch (error) {
      console.error("Error in guildCreate event:", error);
    }
  },
};

export default event;
