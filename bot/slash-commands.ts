import { Events, MessageFlags, Routes } from "discord.js";
import type { ExtendedClient } from "./types.ts";
import { apiConnect } from "./api/apiConnect.ts";

export async function registerSlashCommands(
  client: ExtendedClient,
  clientId: string,
  guildIds: string[],
  token: string,
): Promise<void> {
  try {
    const rest = apiConnect(token);
    const commandsJson = client.commands.map((cmd) => cmd.data.toJSON());
    for (const guildId of guildIds) {
      console.log(`Registering slash commands for guild ${guildId}...`);
      const data = (await rest.put(
        Routes.applicationGuildCommands(clientId, guildId),
        { body: commandsJson },
      )) as unknown[];
      console.log(
        `✅ Successfully registered ${data.length} commands for guild ${guildId}.`,
      );
    }
  } catch (error) {
    console.error("❌ Error registering slash commands:", error);
  }

  client.on(Events.InteractionCreate, async (interaction) => {
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
      await command.execute(interaction);
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
  });
}
