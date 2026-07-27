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
      content:
        "Well, that shouldn't happen. Lerche doesn't think your server exists. Please reinstall her. If this error contuines, please reach out on the support server: https://discord.gg/EvRpWuj7We",
      flags: MessageFlags.Ephemeral,
    });
    return null;
  }

  return interaction;
}
