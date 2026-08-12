import { BotCommand, TTSModels } from "../types.ts";
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
    )
    .addStringOption((option) =>
      option
        .setName("model-type")
        .setDescription("The model type for the TTS voice.")
        .setRequired(true)
        .addChoices(
          //  loop the models  //
          ...Object.values(TTSModels).map((model) => ({
            name: model,
            value: model,
          })),
        ),
    ),
  async execute(interaction, client, extendedGuild) {
    await interaction.deferReply();
    let voiceId = interaction.options.getString("voice-id", true);
    let voiceName: string = "";
    const ElevenLabsInstance = ElevenLabs.getInstance();
    const modelType = interaction.options.getString("model-type", true);

    try {
      modelType == TTSModels.ElevenLabsV3 ||
      modelType == TTSModels.ElevenLabsFlashV2_5
        ? (voiceId = await ElevenLabsInstance.ensureVoiceAvailable(voiceId)) &&
          (voiceName = await ElevenLabsInstance.getVoiceName(voiceId))
        : voiceId && (voiceName = "Fish Voice");
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
      voice_name: voiceName,
      voice_provider: modelType,
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
