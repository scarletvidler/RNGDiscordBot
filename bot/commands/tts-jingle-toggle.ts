import { SlashCommandBuilder } from "discord.js";
import type { BotCommand } from "../types.ts";
import { saveGuildTTSSettings } from "../../supabase/models/guilds.ts";

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("tts-jingle-toggle")
    .setDescription(
      "Toggles the jingle that plays before the first TTS message.",
    ),
  requirements: {
    userPermissions: ["Administrator"],
  },
  async execute(interaction, client) {
    await interaction.deferReply();

    const guild = client.installedGuilds.find(
      (installedGuild) => installedGuild.id === interaction.guildId,
    );

    if (!guild) {
      await interaction.editReply("This command can only be used in a guild.");
      return;
    }

    const nextValue = !guild.settings.tts.pingSoundEnabled;
    guild.settings.tts.pingSoundEnabled = nextValue;
    await saveGuildTTSSettings(guild.id, guild.settings.tts);

    await interaction.editReply(
      `The TTS jingle has been ${nextValue ? "enabled" : "disabled"} for this guild.`,
    );
  },
};

export default command;
