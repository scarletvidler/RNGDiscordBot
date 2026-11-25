import type { Message } from "discord.js";
import { Readable } from "node:stream";
import ElevenLabs from "../ElevenLabs.ts";
import FishAudio from "../FishAudio.ts";
import streamToBuffer from "../../helpers/streamToBuffer.ts";
import validateMessageContent from "./validate.ts";
import type {
  DBVoiceRole,
  DBVoiceUser,
} from "../../../supabase/models/voice.ts";
import type { DBGuildTtsSettings } from "../../../supabase/models/guilds.ts";
import type { TokenRate } from "../../../supabase/models/tokenRates.ts";
import type { TTSModels } from "../../types.ts";
import { TTS_MODELS } from "../../config/defaults.ts";
import type { PlanAccess } from "../planAccess.ts";
import { getSpeechOptions, stripEmotionTags } from "./speechFeatures.ts";
import {
  estimateTokens,
  getActualTokens,
  getModelTokenRate,
} from "./tokenCost.ts";

export interface PreparedSpeech {
  text: string;
  model: TTSModels;
  voiceId: string;
  rate: TokenRate;
  estimatedTokens: number;
}

export interface ConvertedSpeech {
  audio: Readable;
  playedMessage: string;
  tokensUsed: number;
}

export class SpeechGenerationError extends Error {
  constructor(public readonly canReleaseReservation: boolean) {
    super("The speech provider could not complete this request");
  }
}

function wasRequestRejected(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("statusCode" in error)) {
    return false;
  }
  const status = error.statusCode;
  return (
    typeof status === "number" &&
    status >= 400 &&
    status < 500 &&
    status !== 408
  );
}

export async function prepareSpeech(
  message: Message<boolean>,
  voice: DBVoiceUser | DBVoiceRole | null,
  settings: DBGuildTtsSettings,
  access: PlanAccess,
): Promise<PreparedSpeech> {
  const { model, voiceId } = getSpeechOptions(settings, voice, access);
  let text = validateMessageContent(message);
  if (!access.emotionTags) text = stripEmotionTags(text);
  const rate = await getModelTokenRate(model);
  return {
    text,
    model,
    voiceId,
    rate,
    estimatedTokens: estimateTokens(text, rate),
  };
}

export default async function convertToSpeech(
  speech: PreparedSpeech,
): Promise<ConvertedSpeech> {
  return TTS_MODELS[speech.model].provider === "fish"
    ? convertToSpeechWithFishAI(speech)
    : convertToSpeechWithElevenLabs(speech);
}

export async function convertToSpeechWithElevenLabs(
  speech: PreparedSpeech,
): Promise<ConvertedSpeech> {
  const elevenlabs = ElevenLabs.getInstance();
  try {
    const { data, rawResponse } = await elevenlabs.convertTextToSpeech(
      speech.voiceId,
      speech.text,
      speech.model,
    );
    if (!data) throw new Error("ElevenLabs returned no audio stream");

    const content = await streamToBuffer(data);
    if (!content.length) throw new Error("ElevenLabs returned empty audio");
    const tokensUsed = getActualTokens(
      speech.text,
      rawResponse.headers,
      speech.rate,
    );
    return {
      audio: Readable.from([content]),
      playedMessage: speech.text,
      tokensUsed,
    };
  } catch (error) {
    // Provider errors can include the submitted text or request credentials.
    throw new SpeechGenerationError(wasRequestRejected(error));
  }
}

export async function convertToSpeechWithFishAI(
  speech: PreparedSpeech,
): Promise<ConvertedSpeech> {
  const fishAudio = FishAudio.getInstance();
  try {
    const { data, rawResponse } = await fishAudio.convertTextToSpeech(
      speech.voiceId,
      speech.text,
      speech.model,
    );
    if (!data) throw new Error("Fish Audio returned no audio stream");

    const content = await streamToBuffer(data);
    if (!content.length) throw new Error("Fish Audio returned empty audio");
    const tokensUsed = getActualTokens(
      speech.text,
      rawResponse.headers,
      speech.rate,
    );
    return {
      audio: Readable.from([content]),
      playedMessage: speech.text,
      tokensUsed,
    };
  } catch (error) {
    // Log only the provider's status and response, never the submitted text.
    const e = error as { statusCode?: number; body?: unknown; name?: string };
    console.error("Fish TTS failed", {
      status: e?.statusCode,
      name: e?.name,
      body: e?.body,
      model: speech.model,
      voiceId: speech.voiceId,
    });
    throw new SpeechGenerationError(wasRequestRejected(error));
  }
}
