import { SlashCommandBuilder } from "discord.js";
import { BotCommand } from "../types.ts";

const helpCommand: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("help")
    .setDescription("Explains how to use the bot and its commands."),
  async execute(interaction, client) {
    await interaction.deferReply();
    const helpMessage = `
**Hi! I'm Leroy, a Discord bot that can read messages aloud in voice channels.**
- You can join my how-to-use server here: https://discord.gg/XMznfREnuH
- Thank you for using me! If you have any questions or need assistance, feel free ask for help on that server.
`;
    await interaction.editReply(helpMessage);
  },
};
export default helpCommand;
