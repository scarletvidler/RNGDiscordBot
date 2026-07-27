import { SlashCommandBuilder } from "discord.js";
import { BotCommand } from "../types.ts";
import ElevenLabs from "../modules/ElevenLabs.ts";
import { saveGuildTTSSettings } from "../../supabase/models/guilds.ts";

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("tts-m-voice-paid-feature")
    .setDescription("Sets the male TTS voice ID for this guild.")
    .addStringOption((option) =>
      option
        .setName("voice-id")
        .setDescription("The ElevenLabs voice ID to use for male voices.")
        .setRequired(true),
    ),
  requirements: {
    userPermissions: ["Administrator"],
  },
  async execute(interaction, client, extendedGuild) {
    await interaction.deferReply();

    let voiceId = interaction.options.getString("voice-id", true);
    const ElevenLabsInstance = ElevenLabs.getInstance();

    try {
      voiceId = await ElevenLabsInstance.ensureVoiceAvailable(voiceId);
    } catch (error) {
      console.error("Error ensuring voice availability:", error);
      await interaction.editReply(
        `Failed to ensure voice availability for ID: ${voiceId}. Please ensure the voice ID is valid.`,
      );
      return;
    }

    extendedGuild.settings.tts.maleVoiceId = voiceId;
    await saveGuildTTSSettings(extendedGuild.id, extendedGuild.settings.tts);
    await interaction.editReply(`Male voice ID set to: ${voiceId}`);
  },
};

export default command;
