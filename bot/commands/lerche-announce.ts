import { SlashCommandBuilder, TextChannel } from "discord.js";
import { BotCommand } from "../types.ts";

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
      const channels = await guild.channels.fetch();
      const channel = channels.find(
        (c) => c?.name === "lerche-updates" && c.isTextBased(),
      ) as TextChannel | undefined;

      if (channel) {
        await channel.send(message);
        results.push(`✅ ${guild.name}`);
      } else {
        results.push(`❌ ${guild.name} (no "lerche-updates" channel)`);
      }
    }

    await interaction.editReply(`Announcement sent:\n${results.join("\n")}`);
  },
};

export default command;
