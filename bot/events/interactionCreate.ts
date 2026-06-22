import { Events, Interaction, MessageFlags } from "discord.js";
import { BotEvent, ExtendedClient } from "../types.ts";

const event: BotEvent<[Interaction, ExtendedClient]> = {
  type: "interactionCreate",
  execute: async (interaction, client) => {
    if (!interaction.isChatInputCommand()) return;
    const command = interaction.client.commands.get(interaction.commandName);

    if (!command) {
      console.error(
        `No command matching ${interaction.commandName} was found.`,
      );
      return;
    }

    const member = interaction.member;

    if (!member || !("permissions" in member)) {
      console.error("Interaction member is not a GuildMember.");
      return;
    }

    if (command.requirements?.userPermissions) {
      const missingPermissions = command.requirements.userPermissions.filter(
        (perm) => !member.permissions.has(perm as any),
      );

      if (missingPermissions.length > 0) {
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
