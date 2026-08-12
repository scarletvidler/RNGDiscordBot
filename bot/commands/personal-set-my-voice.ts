import { BotCommand } from "../types.ts";
import { SlashCommandBuilder } from "discord.js";
import ElevenLabs from "../modules/ElevenLabs.ts";
import { createVoice } from "../../supabase/models/voice.ts";

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("personal-set-my-voice")
    .setDescription("Sets your personal TTS voice ID for this guild.")
    .addStringOption((option) =>
      option
        .setName("voice-id")
        .setDescription(
          "The ElevenLabs voice ID to use for your personal TTS voice.",
        )
        .setRequired(true),
    ),
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

    await createVoice({
      owner_id: interaction.user.id,
      voice_id: voiceId,
      voice_name: await ElevenLabsInstance.getVoiceName(voiceId),
      voice_provider: "elevenlabs",
      guild_id: interaction.guildId!,
      owner_type: "user",
      created_at: new Date().toISOString(),
    });

    await interaction.editReply(
      `Your personal TTS voice ID has been set to: ${voiceId}`,
    );
  },
};

export default command;
