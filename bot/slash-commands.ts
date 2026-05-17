import { Events, MessageFlags, REST, Routes } from "discord.js";
import type { ExtendedClient } from "./types.js";

export async function registerSlashCommands(
  client: ExtendedClient,
  clientId: string,
  guildIds: string[],
  token: string,
): Promise<void> {
  try {
    const rest = new REST({ version: "10" }).setToken(token);
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
