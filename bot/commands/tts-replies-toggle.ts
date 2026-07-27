// Disable TTS replies for this guild

import { SlashCommandBuilder } from "discord.js";
import { BotCommand } from "../types.ts";
import { saveGuildTTSSettings } from "../../supabase/models/guilds.ts";

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("tts-replies-toggle")
    .setDescription("Toggles TTS replies for this guild."),
  requirements: {
    userPermissions: ["Administrator"],
  },
  async execute(interaction, client, extendedGuild) {
    await interaction.deferReply();
    // Update the guild settings to toggle TTS replies
    extendedGuild.settings.tts.repliesEnabled =
      !extendedGuild.settings.tts.repliesEnabled;
    await saveGuildTTSSettings(extendedGuild.id, extendedGuild.settings.tts);
    await interaction.editReply(
      `TTS replies have been ${extendedGuild.settings.tts.repliesEnabled ? "enabled" : "disabled"} for this guild.`,
    );
  },
};

export default command;
