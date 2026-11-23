import type { DBGuildTtsSettings } from "../../../supabase/models/guilds.ts";
import type {
  DBVoiceRole,
  DBVoiceUser,
} from "../../../supabase/models/voice.ts";
import {
  DEFAULTS,
  TTS_MODELS,
  getDefaultVoiceId,
  isTTSModel,
} from "../../config/defaults.ts";
import { TTSModels } from "../../types.ts";
import type { PlanAccess } from "../planAccess.ts";

export function stripEmotionTags(text: string): string {
  return text
    .replace(/\[[^\]\r\n]*\]/g, "")
    .replace(/ {2,}/g, " ")
    .trim();
}

export function getSpeechOptions(
  settings: Pick<DBGuildTtsSettings, "tts_model" | "default_voice_id">,
  voice: DBVoiceUser | DBVoiceRole | null,
  access: PlanAccess,
): { model: TTSModels; voiceId: string } {
  const configuredModel =
    (access.voiceSelection && voice?.voice_provider) || settings.tts_model;
  let model =
    configuredModel && isTTSModel(configuredModel)
      ? configuredModel
      : DEFAULTS.defaultModel;
  const configuredProvider = TTS_MODELS[model].provider;

  if (!access.higherVoiceModules && model !== TTSModels.ElevenLabsFlashV2_5) {
    model = TTSModels.ElevenLabsFlashV2_5;
  }

  let voiceId = getDefaultVoiceId(model);
  if (
    access.voiceSelection &&
    configuredProvider === TTS_MODELS[model].provider
  ) {
    voiceId = voice?.voice_id || settings.default_voice_id || voiceId;
  }
  return { model, voiceId };
}
