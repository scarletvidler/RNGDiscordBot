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
      // Send a message to the system channel if it exists
      if (guild.systemChannel) {
        guild.systemChannel.send(
          "Hello! Thanks for inviting me to your server! Please make a channel named 'lerche-updates' for me to send updates in. " +
            "Also, make sure to set up the roles and permissions for me to work properly. Lerche is updating constantly and this message is just a placeholder. " +
            "Sorry for spamming your server! " +
            "If you need help, feel free to reach out to the support server! " +
            "https://discord.gg/NZWJvdsMKn",
        );
      }
    } catch (error) {
      console.error("Error in guildCreate event:", error);
    }
  },
};

export default event;
