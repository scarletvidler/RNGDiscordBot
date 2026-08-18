import { BotCommand, TTSModels } from "../types.ts";
import { SlashCommandBuilder } from "discord.js";
import ElevenLabs from "../modules/ElevenLabs.ts";
import { createVoice } from "../../supabase/models/voice.ts";
import ClientInstance from "../modules/ClientInstance.ts";
import FishAudio from "../modules/FishAudio.ts";

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("personal-set-my-voice")
    .setDescription("Sets your personal TTS voice ID for this guild.")
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
    )
    .addStringOption((option) =>
      option
        .setName("voice-id")
        .setDescription("The voice ID to use for your personal TTS voice.")
        .setRequired(false),
    ),
  async execute(interaction, client, extendedGuild) {
    await interaction.deferReply();
    const modelType = interaction.options.getString("model-type", true);
    let voiceId = interaction.options.getString("voice-id");
    let voiceName: string = "";

    try {
      if (
        modelType == TTSModels.ElevenLabsV3 ||
        modelType == TTSModels.ElevenLabsFlashV2_5
      ) {
        const ElevenLabsInstance = ElevenLabs.getInstance();
        voiceId = voiceId == null ? ClientInstance.default_elevens_id : voiceId;
        voiceId = await ElevenLabsInstance.ensureVoiceAvailable(voiceId);
        voiceName = await ElevenLabsInstance.getVoiceName(voiceId);
      } else {
        voiceId = voiceId == null ? ClientInstance.default_fish_id : voiceId;
        voiceName = await FishAudio.getInstance().ensureVoiceAvailable(voiceId);
      }
    } catch (error) {
      console.error("Error ensuring voice availability:", error);
      await interaction.editReply(
        `Failed to ensure voice availability for ID: ${voiceId}. Please ensure the voice ID is valid.`,
      );
      return;
    }

    console.log(`Voice id: ${voiceId}`);

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
