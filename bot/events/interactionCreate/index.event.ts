import { type Interaction } from "discord.js";
import type { BotEvent, ExtendedClient } from "../../types.ts";
import { getGuildChatInputInteraction } from "./guards.ts";
import { ensureCommandPermissions } from "./permissions.ts";
import { executeCommandSafely } from "./executeCommand.ts";

const event: BotEvent<[Interaction, ExtendedClient]> = {
  type: "interactionCreate",
  execute: async (interaction, client) => {
    const guildInteraction = await getGuildChatInputInteraction(interaction);
    if (!guildInteraction) return;

    const command = guildInteraction.client.commands.get(
      guildInteraction.commandName,
    );
    if (!command) {
      console.error(
        `No command matching ${guildInteraction.commandName} was found.`,
      );
      return;
    }

    if (!(await ensureCommandPermissions(guildInteraction, command))) return;

    await executeCommandSafely(guildInteraction, command, client);
  },
};

export default event;
