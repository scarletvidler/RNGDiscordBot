import { TTSModels } from "../types.ts";

export type TTSProvider = "elevenlabs" | "fish";

export type TTSModelDefinition = {
  label: string;
  description: string;
  provider: TTSProvider;
};

export const DEFAULTS = {
  ownerId: "122548971737579520",
  ttsChannelName: "lerche-tts",
  idleTimeoutSeconds: 600,
  defaultModel: TTSModels.ElevenLabsV3,
  voiceIds: {
    elevenlabs: "cgSgspJ2msm6clMCkdW9",
    fish: "9a9cf47702da476aa4629e2506d4a857",
  },
} as const;

export const TTS_MODELS: Record<TTSModels, TTSModelDefinition> = {
  [TTSModels.ElevenLabsV3]: {
    label: "ElevenLabs v3",
    description: "ElevenLabs' expressive, high-quality model.",
    provider: "elevenlabs",
  },
  [TTSModels.ElevenLabsFlashV2_5]: {
    label: "ElevenLabs Flash v2.5",
    description: "A faster ElevenLabs model with lower latency.",
    provider: "elevenlabs",
  },
  [TTSModels.FishPro]: {
    label: "Fish Audio Pro",
    description: "Fish Audio using Lerche's configured Pro/free backend.",
    provider: "fish",
  },
};

export function isTTSModel(value: string): value is TTSModels {
  return Object.hasOwn(TTS_MODELS, value);
}

export function getDefaultVoiceId(model: TTSModels): string {
  return DEFAULTS.voiceIds[TTS_MODELS[model].provider];
}
