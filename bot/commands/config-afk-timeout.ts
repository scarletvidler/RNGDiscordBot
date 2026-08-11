import { SlashCommandBuilder } from "discord.js";
import { BotCommand } from "../types.ts";
import { DBUpsertGuildTTSSettings } from "../../supabase/models/guilds.ts";

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("config-afk-timeout")
    .setDescription(
      "Sets the time before the bot leaves the voice channel due to inactivity.",
    )
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
    extendedGuild.settings.tts.idle_timeout_seconds = seconds;
    await DBUpsertGuildTTSSettings(extendedGuild.settings.tts);
    await interaction.editReply(`TTS idle timeout set to: ${seconds} seconds`);
  },
};

export default command;
