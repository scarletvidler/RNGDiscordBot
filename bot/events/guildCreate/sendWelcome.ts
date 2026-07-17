import type { Guild } from "discord.js";

export async function sendWelcomeMessage(guild: Guild): Promise<void> {
  if (!guild.systemChannel) return;

  guild.systemChannel
    .send(
      "Hello! Thanks for inviting me to your server! Please make a channel named 'lerche-updates' for me to send updates in. " +
        "Also, make sure to set up the roles and permissions for me to work properly. Lerche is updating constantly and this message is just a placeholder. " +
        "Sorry for spamming your server! " +
        "If you need help, feel free to reach out to the support server! " +
        "https://discord.gg/NZWJvdsMKn",
    )
    .catch((error) => {
      console.error(
        `Failed to send message to system channel in guild ${guild.id} (${guild.name}):`,
        error,
      );
    });
}
