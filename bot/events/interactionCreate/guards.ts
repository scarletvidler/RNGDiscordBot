import {
  MessageFlags,
  type ChatInputCommandInteraction,
  type Interaction,
} from "discord.js";

export async function getGuildChatInputInteraction(
  interaction: Interaction,
): Promise<ChatInputCommandInteraction<"cached"> | null> {
  if (!interaction.isChatInputCommand()) return null;

  if (!interaction.inCachedGuild()) {
    await interaction.reply({
      content: "This command can only be used in a guild.",
      flags: MessageFlags.Ephemeral,
    });
    return null;
  }

  return interaction;
}
