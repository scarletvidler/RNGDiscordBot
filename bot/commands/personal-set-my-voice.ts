import { BotCommand, TTSModels } from "../types.ts";
import { SlashCommandBuilder } from "discord.js";
import ElevenLabs from "../modules/ElevenLabs.ts";
import {
  createVoice,
  type DBVoiceUser,
} from "../../supabase/models/voice.ts";
import FishAudio from "../modules/FishAudio.ts";
import {
  getDefaultVoiceId,
  isTTSModel,
  TTS_MODELS,
} from "../config/defaults.ts";

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
            name: TTS_MODELS[model].label,
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
    const selectedModel = interaction.options.getString("model-type", true);
    if (!isTTSModel(selectedModel)) {
      await interaction.editReply("That TTS model is not supported.");
      return;
    }
    const modelType = selectedModel;
    let voiceId = interaction.options.getString("voice-id")?.trim() || null;
    let voiceName: string = "";

    try {
      if (
        modelType == TTSModels.ElevenLabsV3 ||
        modelType == TTSModels.ElevenLabsFlashV2_5
      ) {
        const ElevenLabsInstance = ElevenLabs.getInstance();
        voiceId = voiceId ?? getDefaultVoiceId(modelType);
        voiceId = await ElevenLabsInstance.ensureVoiceAvailable(voiceId);
        voiceName = await ElevenLabsInstance.getVoiceName(voiceId);
      } else {
        voiceId = voiceId ?? getDefaultVoiceId(modelType);
        voiceId = await FishAudio.getInstance().ensureVoiceAvailable(voiceId);
        voiceName = "Fish Voice";
      }
    } catch (error) {
      console.error("Error ensuring voice availability:", error);
      await interaction.editReply(
        `Failed to ensure voice availability for ID: ${voiceId}. Please ensure the voice ID is valid.`,
      );
      return;
    }

    console.log(`Voice id: ${voiceId}`);

    let savedVoice: DBVoiceUser;
    try {
      savedVoice = (await createVoice({
        owner_id: interaction.user.id,
        voice_id: voiceId,
        voice_name: voiceName,
        voice_provider: modelType,
        guild_id: interaction.guildId!,
        owner_type: "user",
        created_at: new Date().toISOString(),
      })) as DBVoiceUser;
    } catch (error) {
      console.error("Error saving personal voice:", error);
      await interaction.editReply(
        "I couldn't save your personal TTS voice. Please try again later.",
      );
      return;
    }

    const cachedUser = extendedGuild.users.find(
      (user) => user.id === interaction.user.id,
    );
    if (cachedUser) {
      cachedUser.voice = savedVoice;
    } else {
      extendedGuild.users.push({
        id: interaction.user.id,
        voice: savedVoice,
      });
    }

    await interaction.editReply(
      `Your personal TTS voice ID has been set to: ${savedVoice.voice_id}`,
    );
  },
};

export default command;
