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
  async execute(interaction, client) {
    await interaction.deferReply();
    const guild = client.installedGuilds.find(
      (g) => g.id === interaction.guildId,
    );
    if (!guild) {
      await interaction.editReply("This command can only be used in a guild.");
      return;
    }
    // Update the guild settings to toggle TTS replies
    const extendedGuild = guild as any;
    extendedGuild.settings.tts.repliesEnabled =
      !extendedGuild.settings.tts.repliesEnabled;
    await saveGuildTTSSettings(guild.id, extendedGuild.settings.tts);
    await interaction.editReply(
      `TTS replies have been ${extendedGuild.settings.tts.repliesEnabled ? "enabled" : "disabled"} for this guild.`,
    );
  },
};

export default command;
