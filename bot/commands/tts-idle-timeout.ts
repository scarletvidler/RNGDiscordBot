import { SlashCommandBuilder } from "discord.js";
import { BotCommand } from "../types.ts";

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("tts-idle-timeout")
    .setDescription("Sets the TTS idle timeout for this guild.")
    .addIntegerOption((option) =>
      option
        .setName("seconds")
        .setDescription(
          "Seconds of inactivity before the bot leaves the voice channel.",
        )
        .setRequired(true)
        .setMinValue(30),
    ),
  requirements: {
    userPermissions: ["Administrator"],
  },
  async execute(interaction, client) {
    await interaction.deferReply();
    const guild = client.installedGuilds.find(
      (g) => g.id === interaction.guildId,
    );
    if (!guild) {
      await interaction.editReply("This command can only be used in a guild.");
      return;
    }
    const seconds = interaction.options.getInteger("seconds", true);
    const extendedGuild = guild as any;
    extendedGuild.settings.tts.idleTimeout = seconds;
    await interaction.editReply(`TTS idle timeout set to: ${seconds} seconds`);
  },
};

export default command;
