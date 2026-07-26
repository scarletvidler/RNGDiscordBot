import { createReadStream } from "node:fs";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

type DictionaryLocator = {
  pronunciationDictionaryId: string;
  versionId: string;
};

type AudioWithRawResponse = {
  data: ReadableStream<Uint8Array<ArrayBufferLike>>;
  rawResponse: Pick<Response, "status" | "headers">;
};

class ElevenLabs {
  private static instance?: ElevenLabs;

  private client: ElevenLabsClient;
  private defaultDictionaryLocator?: DictionaryLocator;
  private defaultDictionaryPromise?: Promise<DictionaryLocator>;

  private constructor(apiKey: string) {
    this.client = new ElevenLabsClient({ apiKey });
  }

  static getInstance(): ElevenLabs {
    if (!ElevenLabs.instance) {
      const apiKey = process.env.ELEVENLABS_API_KEY;
      if (!apiKey) {
        throw new Error("❌ ELEVENLABS_API_KEY missing from .env");
      }
      ElevenLabs.instance = new ElevenLabs(apiKey);
    }

    return ElevenLabs.instance;
  }

  private async getDefaultDictionaryLocator(): Promise<DictionaryLocator> {
    if (this.defaultDictionaryLocator) {
      return this.defaultDictionaryLocator;
    }

    if (!this.defaultDictionaryPromise) {
      this.defaultDictionaryPromise = this.client.pronunciationDictionaries
        .createFromFile({
          file: createReadStream("bot/pronunciation/dictionary.pls"),
          name: "default",
        })
        .then((dictionary) => ({
          pronunciationDictionaryId: dictionary.id,
          versionId: dictionary.versionId,
        }));
    }

    this.defaultDictionaryLocator = await this.defaultDictionaryPromise;
    return this.defaultDictionaryLocator;
  }

  async convertTextToSpeech(voiceId: string, text: string) {
    const dictionary = await this.getDefaultDictionaryLocator();

    return this.client.textToSpeech
      .convert(voiceId, {
        text,
        modelId: "eleven_v3",
        outputFormat: "mp3_44100_128",
        pronunciationDictionaryLocators: [dictionary],
      })
      .withRawResponse();
  }

  async getVoiceName(voiceId: string): Promise<string> {
    try {
      const voice = await this.client.voices.get(voiceId).withRawResponse();
      if (!voice || !voice.data) {
        throw new Error(`No voice data returned for voiceId ${voiceId}`);
      } else {
        const voiceData = voice.data;
        return voiceData.name || "Unknown Voice Name";
      }
    } catch (error) {
      console.error(`Error fetching voice name for voiceId ${voiceId}:`, error);
      throw error;
    }
  }

  async ensureVoiceAvailable(voiceId: string): Promise<string> {
    // It is already accessible to this account
    try {
      const voice = await this.client.voices.get(voiceId);
      return voice.voiceId ?? voiceId;
    } catch {
      // Continue and search the public Voice Library
    }

    const result = await this.client.voices.getShared({
      search: voiceId,
      pageSize: 10,
    });

    const sharedVoice = result.voices.find(
      (voice) => voice.voiceId === voiceId,
    );

    if (!sharedVoice) {
      throw new Error(
        "That voice is not accessible. It may be private, unshared, deleted, or unavailable to Lerche currently. Please reach out to Lerche's support (`/help`) if you feel this is a bug.",
      );
    }

    await this.client.voices.share(
      sharedVoice.publicOwnerId,
      sharedVoice.voiceId,
      {
        newName: sharedVoice.name ?? `Discord-${voiceId}`,
      },
    );

    return sharedVoice.voiceId ?? voiceId;
  }
}

export default ElevenLabs;
