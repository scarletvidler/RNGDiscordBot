import type { BotCommand } from "../types.ts";
import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { botVersion } from "../version.ts";

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("version")
    .setDescription("Shows the current bot version."),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.reply({
      content: `Lerche Discord Bot v${botVersion}`,
      ephemeral: true,
    });
  },
};

export default command;
