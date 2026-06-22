import { SlashCommandBuilder } from "discord.js";
import { BotCommand } from "../types.ts";
import { sendGuildAnnouncement } from "../modules/sendGuildAnnouncement.ts";

const command: BotCommand = {
  guildId: "1179157503766962176",
  data: new SlashCommandBuilder()
    .setName("lerche-announce")
    .setDescription(
      "Send a message to the Lerche Updates channel on all servers.",
    )
    .addStringOption((option) =>
      option
        .setName("message")
        .setDescription("The message to send.")
        .setRequired(true),
    ),
  async execute(interaction, client) {
    await interaction.deferReply({ ephemeral: true });

    const message = interaction.options.getString("message", true);
    const results: string[] = [];

    for (const guild of client.guilds.cache.values()) {
      const result = await sendGuildAnnouncement(guild, message);
      if (result.ok) {
        results.push(`[sent] ${result.guildName}`);
      } else {
        results.push(`[skipped] ${result.guildName} (${result.reason})`);
      }
    }

    await interaction.editReply(`Announcement sent:\n${results.join("\n")}`);
  },
};

export default command;
