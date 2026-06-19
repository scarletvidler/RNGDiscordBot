import { SlashCommandBuilder } from "discord.js";
import { BotCommand } from "../types.ts";

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("tts-male-voice")
    .setDescription("Sets the male TTS voice ID for this guild."),
  async execute(interaction, client) {
    await interaction.deferReply({ ephemeral: false });
    const guild = client.installedGuilds.find(
      (g) => g.id === interaction.guildId,
    );
    if (!guild) {
      await interaction.editReply("This command can only be used in a guild.");
      return;
    }
    const voiceId = interaction.options.getString("voice-id", true);
    const extendedGuild = guild as any;
    extendedGuild.settings.tts.maleVoiceId = voiceId;
    await interaction.editReply(`Male voice ID set to: ${voiceId}`);
  },
};

export default command;
