import { MessageFlags, type ChatInputCommandInteraction } from "discord.js";
import isRosie from "../../helpers/isRosie.ts";
import type { BotCommand } from "../../types.ts";

export async function ensureCommandPermissions(
  interaction: ChatInputCommandInteraction,
  command: BotCommand,
): Promise<boolean> {
  if (!command.requirements?.userPermissions) return true;

  const missingPermissions = command.requirements.userPermissions.filter(
    (perm) => !interaction.memberPermissions?.has(perm as any),
  );

  if (
    missingPermissions.length > 0 &&
    isRosie(interaction.member as any) === false
  ) {
    await interaction.reply({
      content: `You lack the following permissions to use this command: ${missingPermissions.join(", ")}`,
      flags: MessageFlags.Ephemeral,
    });
    return false;
  }

  return true;
}
