import { MessageFlags, type ChatInputCommandInteraction } from "discord.js";
import type { ExtendedClient, BotCommand } from "../../types.ts";

export async function executeCommandSafely(
  interaction: ChatInputCommandInteraction,
  command: BotCommand,
  client: ExtendedClient,
): Promise<void> {
  try {
    await command.execute(interaction, client);
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
