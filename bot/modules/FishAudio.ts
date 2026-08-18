import { FishAudioClient, type Backends } from "fish-audio";
import { FishAudioModels, TTSModels } from "../types.ts";

type AudioWithRawResponse = {
  data: ReadableStream<Uint8Array<ArrayBufferLike>>;
  rawResponse: Pick<Response, "status" | "headers">;
};

class FishAudio {
  private static instance?: FishAudio;

  private client: FishAudioClient;

  private constructor(apiKey: string) {
    this.client = new FishAudioClient({ apiKey });
  }

  static getInstance(): FishAudio {
    if (!FishAudio.instance) {
      const apiKey = process.env.FISH_API_KEY;
      if (!apiKey) {
        throw new Error("❌ FISH_API_KEY missing from .env");
      }
      FishAudio.instance = new FishAudio(apiKey);
    }

    return FishAudio.instance;
  }

  async convertTextToSpeech(
    voiceId: string,
    text: string,
    modelParam: TTSModels,
  ): Promise<AudioWithRawResponse> {
    let model = FishAudioModels.FishProFree;
    if (modelParam === TTSModels.FishPro) {
      model = FishAudioModels.FishProFree;
    }

    console.log(`Model used: ${model}, user input was ${modelParam}`);

    return this.client.textToSpeech
      .convert(
        {
          text,
          reference_id: voiceId,
          format: "mp3",
          mp3_bitrate: 128,
          sample_rate: 44100,
        },
        // The API supports this backend even though the published SDK's
        // Backends union has not caught up yet.
        model as Backends,
      )
      .withRawResponse();
  }

  async getVoiceName(voiceId: string): Promise<string> {
    try {
      const voice = await this.client.voices.get(voiceId).withRawResponse();
      if (!voice?.data) {
        throw new Error(`No voice data returned for voiceId ${voiceId}`);
      }

      return voice.data.title || "Unknown Voice Name";
    } catch (error) {
      console.error(`Error fetching voice name for voiceId ${voiceId}:`, error);
      throw error;
    }
  }

  async ensureVoiceAvailable(voiceId: string): Promise<string> {
    try {
      await this.client.voices.get(voiceId);
      return voiceId;
    } catch {
      // Continue and search available voices
    }

    const result = await this.client.voices.search({ title: voiceId });

    const sharedVoice = result.items.find((voice) => voice._id === voiceId);

    if (!sharedVoice) {
      throw new Error(
        "That voice is not accessible. It may be private, unshared, deleted, or unavailable to Lerche currently. Please reach out to Lerche's support (`/help`) if you feel this is a bug.",
      );
    }

    return sharedVoice._id ?? voiceId;
  }
}

export default FishAudio;
