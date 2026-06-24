import { SlashCommandBuilder } from "discord.js";
import { BotCommand } from "../types.ts";

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("tts-female-voice")
    .setDescription("Sets the female TTS voice ID for this guild.")
    .addStringOption((option) =>
      option
        .setName("voice-id")
        .setDescription("The ElevenLabs voice ID to use for female voices.")
        .setRequired(true),
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
    const voiceId = interaction.options.getString("voice-id", true);
    const extendedGuild = guild as any;
    extendedGuild.settings.tts.femaleVoiceId = voiceId;
    await interaction.editReply(`Female voice ID set to: ${voiceId}`);
  },
};

export default command;
