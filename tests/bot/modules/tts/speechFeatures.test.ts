import assert from "node:assert/strict";
import test from "node:test";
import {
  getSpeechOptions,
  stripEmotionTags,
} from "../../../../bot/modules/tts/speechFeatures.ts";
import { DEFAULTS } from "../../../../bot/config/defaults.ts";
import { TTSModels } from "../../../../bot/types.ts";
import type { DBVoiceUser } from "../../../../supabase/models/voice.ts";

const standard = {
  emotionTags: false,
  voiceSelection: false,
  higherVoiceModules: false,
};
const plus = {
  emotionTags: true,
  voiceSelection: true,
  higherVoiceModules: true,
};

test("standard access removes direction tags while keeping spoken words", () => {
  assert.equal(
    stripEmotionTags("[happy] Hello [whispering] there!"),
    "Hello there!",
  );
  assert.equal(stripEmotionTags("[a custom direction] [laugh]"), "");
  assert.equal(stripEmotionTags("Ordinary words."), "Ordinary words.");
});

test("expired access ignores stored custom voices and high models without changing settings", () => {
  const settings = {
    tts_model: TTSModels.FishPro,
    default_voice_id: "guild-fish-voice",
  };
  const voice = {
    voice_provider: TTSModels.FishPro,
    voice_id: "personal-fish-voice",
  } as DBVoiceUser;
  assert.deepEqual(getSpeechOptions(settings, voice, standard), {
    model: TTSModels.ElevenLabsFlashV2_5,
    voiceId: DEFAULTS.voiceIds.elevenlabs,
  });
  assert.equal(settings.default_voice_id, "guild-fish-voice");
  assert.equal(voice.voice_id, "personal-fish-voice");
  assert.deepEqual(getSpeechOptions(settings, voice, plus), {
    model: TTSModels.FishPro,
    voiceId: "personal-fish-voice",
  });
});

test("voice and model access are checked independently", () => {
  const settings = {
    tts_model: TTSModels.ElevenLabsV3,
    default_voice_id: "guild-voice",
  };
  const voice = {
    voice_provider: TTSModels.ElevenLabsV3,
    voice_id: "personal-voice",
  } as DBVoiceUser;
  assert.deepEqual(
    getSpeechOptions(settings, voice, { ...standard, voiceSelection: true }),
    {
      model: TTSModels.ElevenLabsFlashV2_5,
      voiceId: "personal-voice",
    },
  );
  assert.deepEqual(
    getSpeechOptions(settings, voice, {
      ...standard,
      higherVoiceModules: true,
    }),
    {
      model: TTSModels.ElevenLabsV3,
      voiceId: DEFAULTS.voiceIds.elevenlabs,
    },
  );
});

test("provider fallback never sends a Fish voice ID to ElevenLabs", () => {
  const settings = {
    tts_model: TTSModels.FishPro,
    default_voice_id: "fish-voice",
  };
  assert.deepEqual(
    getSpeechOptions(settings, null, { ...standard, voiceSelection: true }),
    {
      model: TTSModels.ElevenLabsFlashV2_5,
      voiceId: DEFAULTS.voiceIds.elevenlabs,
    },
  );
});
