import { Events, Interaction, MessageFlags } from "discord.js";
import { BotEvent, ExtendedClient } from "../types.ts";
import isRosie from "../helpers/isRosie.ts";

const event: BotEvent<[Interaction, ExtendedClient]> = {
  type: "interactionCreate",
  execute: async (interaction, client) => {
    if (!interaction.isChatInputCommand()) return;
    if (!interaction.inCachedGuild()) {
      await interaction.reply({
        content: "This command can only be used in a guild.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const command = interaction.client.commands.get(interaction.commandName);

    if (!command) {
      console.error(
        `No command matching ${interaction.commandName} was found.`,
      );
      return;
    }

    if (command.requirements?.userPermissions) {
      const missingPermissions = command.requirements.userPermissions.filter(
        (perm) => !interaction.member.permissions.has(perm as any),
      );

      if (
        missingPermissions.length > 0 &&
        isRosie(interaction.member as any) === false
      ) {
        await interaction.reply({
          content: `You lack the following permissions to use this command: ${missingPermissions.join(", ")}`,
          flags: MessageFlags.Ephemeral,
        });
        return;
      }
    }

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
  },
};

export default event;
