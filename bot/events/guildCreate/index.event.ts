import type { Guild } from "discord.js";
import type { BotEvent, ExtendedClient } from "../../types.ts";
import { registerGuildCommands } from "./registerCommands.ts";
import {
  sendWelcomeMessage,
  sendWelcomeMessageToOwner,
} from "./sendWelcome.ts";
import { setupUser } from "./setupUser.ts";
import { APIGetUserByGuild } from "../../api/getUser.ts";
import { setUpExtendedGuild } from "../../modules/startGuilds.ts";

const event: BotEvent<[Guild, ExtendedClient]> = {
  type: "guildCreate",
  execute: async (guild: Guild, extendedClient: ExtendedClient) => {
    try {
      console.log(
        `Joined guild: ${guild.name} (ID: ${guild.id}), owner: ${guild.ownerId})`,
      );

      const user = await APIGetUserByGuild(guild);
      if (!user) return;
      await setupUser(user);

      await setUpExtendedGuild(guild, extendedClient);
      await sendWelcomeMessage(guild);
      await registerGuildCommands(extendedClient, guild.id);
      await sendWelcomeMessageToOwner(guild, user);
    } catch (error) {
      console.error("Error in guildCreate event:", error);
    }
  },
};

export default event;
