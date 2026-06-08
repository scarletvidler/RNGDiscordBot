import { Routes } from "discord.js";
import type { ExtendedClient } from "../types.ts";
import { apiConnect } from "../api/apiConnect.ts";

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
      console.log(`Adding commands for guild 📢 ${guildId}...`);
      const data = (await rest.put(
        Routes.applicationGuildCommands(clientId, guildId),
        { body: commandsJson },
      )) as unknown[];
      console.log(
        `✅ Successfully registered ${data.length} commands for guild 🏘️ ${guildId}.`,
      );
    }
  } catch (error) {
    console.error("❌ Error registering slash commands:", error);
  }
}
