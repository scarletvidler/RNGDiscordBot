import { SlashCommandBuilder } from "discord.js";
import { BotCommand } from "../types.ts";
import { saveGuildTTSSettings } from "../../supabase/models/guilds.ts";

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
  async execute(interaction, client, extendedGuild) {
    await interaction.deferReply();
    const seconds = interaction.options.getInteger("seconds", true);
    extendedGuild.settings.tts.idleTimeout = seconds;
    await saveGuildTTSSettings(extendedGuild.id, extendedGuild.settings.tts);
    await interaction.editReply(`TTS idle timeout set to: ${seconds} seconds`);
  },
};

export default command;
