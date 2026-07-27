import { MessageFlags, type ChatInputCommandInteraction } from "discord.js";
import type { ExtendedClient, BotCommand } from "../../types.ts";

export async function executeCommandSafely(
  interaction: ChatInputCommandInteraction,
  command: BotCommand,
  client: ExtendedClient,
): Promise<void> {
  try {
    const guild = client.installedGuilds.find(
      (g) => g.id === interaction.guildId,
    );
    if (!guild) {
      await interaction.reply({
        content:
          "Well, that shouldn't happen. Lerche doesn't think your server exists. Please reinstall her. If this error contuines, please reach out on the support server: https://discord.gg/EvRpWuj7We",
        flags: MessageFlags.Ephemeral,
      });
      throw new Error(
        `Guild with ID ${interaction.guildId} not found in installedGuilds.`,
      );
      return;
    }

    await command.execute(interaction, client, guild);
  } catch (error) {
    console.error(error);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content: "There was an error while executing this command!",
        flags: MessageFlags.Ephemeral,
      });
    } else {
      await interaction.reply({
        content: "There was an error while executing this command!",
        flags: MessageFlags.Ephemeral,
      });
    }
  }
}
