import type { Guild, User } from "discord.js";

export async function sendWelcomeMessage(guild: Guild): Promise<void> {
  if (!guild.systemChannel) return;
  try {
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
  } catch (error) {
    console.error(
      `Failed to send message to system channel in guild ${guild.id} (${guild.name}):`,
      error,
    );
  }
}

export async function sendWelcomeMessageToOwner(
  guild: Guild,
  user: User,
): Promise<boolean> {
  if (!user) return false;
  try {
    await user.send(
      "Hello! Thanks for inviting me to your server! Please make a channel named 'lerche-updates' for me to send updates in. " +
        "If you need help, feel free to reach out to the support server! " +
        "https://discord.gg/NZWJvdsMKn",
    );
    return true;
  } catch (error) {
    console.error(
      `Failed to send message to owner ${user.id} (${user.tag}) in guild ${guild.id} (${guild.name}):`,
      error,
    );
    return false;
  }
}
