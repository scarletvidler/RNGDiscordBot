import { SlashCommandBuilder } from "discord.js";
import { BotCommand, TTSModels } from "../types.ts";
import ElevenLabs from "../modules/ElevenLabs.ts";
import FishAudio from "../modules/FishAudio.ts";
import {
  DBUpsertGuildTTSSettings,
  syncGuildTTSSettingsWithDB,
} from "../../supabase/models/guilds.ts";
import {
  getDefaultVoiceId,
  isTTSModel,
  TTS_MODELS,
} from "../config/defaults.ts";

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("config-default-voice")
    .setDescription("Sets the default TTS model and voice for this server.")
    .addStringOption((option) =>
      option
        .setName("model")
        .setDescription("The default TTS model.")
        .setRequired(true)
        .addChoices(
          ...Object.values(TTSModels).map((model) => ({
            name: TTS_MODELS[model].label,
            value: model,
          })),
        ),
    )
    .addStringOption((option) =>
      option
        .setName("voice-id")
        .setDescription("Voice ID; omit this to use Lerche's provider default.")
        .setRequired(false),
    ),
  requirements: {
    userPermissions: ["Administrator"],
  },
  async execute(interaction, _client, extendedGuild) {
    await interaction.deferReply();
    const selectedModel = interaction.options.getString("model", true);
    if (!isTTSModel(selectedModel)) {
      await interaction.editReply("That TTS model is not supported.");
      return;
    }

    let voiceId =
      interaction.options.getString("voice-id") ??
      getDefaultVoiceId(selectedModel);
    try {
      voiceId =
        TTS_MODELS[selectedModel].provider === "fish"
          ? await FishAudio.getInstance().ensureVoiceAvailable(voiceId)
          : await ElevenLabs.getInstance().ensureVoiceAvailable(voiceId);
    } catch (error) {
      console.error("Error validating default voice:", error);
      await interaction.editReply(
        `Voice ID ${voiceId} is not accessible for ${TTS_MODELS[selectedModel].label}.`,
      );
      return;
    }

    const settings = await DBUpsertGuildTTSSettings({
      guild_id: extendedGuild.id,
      default_voice_id: voiceId,
      tts_model: selectedModel,
    });
    syncGuildTTSSettingsWithDB(settings, extendedGuild);
    await interaction.editReply(
      `Default voice set to \`${voiceId}\` using **${TTS_MODELS[selectedModel].label}**.`,
    );
  },
};

export default command;
