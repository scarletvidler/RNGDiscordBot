import type { Message } from "discord.js";
import { Readable } from "stream";
import ClientInstance from "../ClientInstance.ts";
import ElevenLabs from "../ElevenLabs.ts";
import streamToBuffer from "../../helpers/streamToBuffer.ts";
import validateMessageContent from "./validate.ts";
import { DBVoiceRole, DBVoiceUser } from "../../../supabase/models/voice.ts";
import FishAudio from "../FishAudio.ts";
import { FishAudioModels } from "../../types.ts";

export default async function convertToSpeech(
  message: Message<boolean>,
  voice: DBVoiceUser | DBVoiceRole | null,
  modelType: string = "eleven_v3",
): Promise<{ audio: Readable; playedMessage: string; tokensUsed: number }> {
  let voiceId = ClientInstance.installedGuilds.find(
    (g) => g.id === message.guildId,
  )?.settings.tts.elevenlabs_female_voice_id;

  if (voice) {
    voiceId = voice.voice_id;
  }

  if (!voiceId) {
    throw new Error("No voiceId configured for this guild.");
  }

  const text = validateMessageContent(message);

  if (modelType.includes("Fish")) {
    return convertToSpeechWithFishAI(
      voiceId,
      text,
      modelType as FishAudioModels,
    );
  } else {
    return convertToSpeechWithElevenLabs(voiceId, text, modelType);
  }
}

export async function convertToSpeechWithElevenLabs(
  voiceId: string,
  text: string,
  modelType: string = "eleven_v3",
): Promise<{ audio: Readable; playedMessage: string; tokensUsed: number }> {
  const elevenlabs = ElevenLabs.getInstance();
  try {
    const { data, rawResponse } = await elevenlabs.convertTextToSpeech(
      voiceId,
      text,
      modelType,
    );
    if (!data) {
      console.error(
        `ElevenLabs returned no audio stream for voice ${voiceId} (status ${rawResponse.status}).`,
      );
      throw new Error(
        `ElevenLabs returned no audio stream for voice ${voiceId} (status ${rawResponse.status}).`,
      );
    }
    const content = await streamToBuffer(data);
    const tokensUsed = rawResponse.headers.get("character-cost") ?? 0; // Example calculation, replace with actual token usage logic

    // convert the buffer to a Readable stream
    const audio = Readable.from([content]);
    return { audio, playedMessage: text, tokensUsed: Number(tokensUsed) };
  } catch (error) {
    console.error("❌ Error converting text to speech:", error);
    console.error(`Text Attempted: ${text}`);
    throw error;
  }
}

export async function convertToSpeechWithFishAI(
  voiceId: string,
  text: string,
  modelType: FishAudioModels,
): Promise<{ audio: Readable; playedMessage: string; tokensUsed: number }> {
  const fishAudio = FishAudio.getInstance();
  try {
    const { data, rawResponse } = await fishAudio.convertTextToSpeech(
      voiceId,
      text,
      modelType,
    );
    if (!data) {
      console.error(
        `FishAudio returned no audio stream for voice ${voiceId} (status ${rawResponse.status}).`,
      );
      throw new Error(
        `FishAudio returned no audio stream for voice ${voiceId} (status ${rawResponse.status}).`,
      );
    }
    const content = await streamToBuffer(data);
    const tokensUsed = rawResponse.headers.get("character-cost") ?? 0; // Example calculation, replace with actual token usage logic
    // convert the buffer to a Readable stream
    const audio = Readable.from([content]);
    return { audio, playedMessage: text, tokensUsed: Number(tokensUsed) };
  } catch (error) {
    console.error("❌ Error converting text to speech:", error);
    console.error(`Text Attempted: ${text}`);
    throw error;
  }
}
