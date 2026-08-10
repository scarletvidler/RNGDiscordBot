// Disable TTS replies for this guild

import { SlashCommandBuilder } from "discord.js";
import type { BotCommand } from "../types.ts";
import { DBUpsertGuildTTSSettings } from "../../supabase/models/guilds.ts";

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
    extendedGuild.settings.tts.replies_enabled =
      !extendedGuild.settings.tts.replies_enabled;
    await DBUpsertGuildTTSSettings(extendedGuild.settings.tts);
    await interaction.editReply(
      `TTS replies have been ${extendedGuild.settings.tts.replies_enabled ? "enabled" : "disabled"} for this guild.`,
    );
  },
};

export default command;
