import type { Message } from "discord.js";
import { Readable } from "stream";
import ClientInstance from "../ClientInstance.ts";
import isRosie from "../../helpers/isRosie.ts";
import ElevenLabs from "../ElevenLabs.ts";
import streamToBuffer from "../../helpers/streamToBuffer.ts";
import validateMessageContent from "./validate.ts";

export default async function convertToSpeech(
  message: Message<boolean>,
): Promise<{ audio: Readable; playedMessage: string; tokensUsed: number }> {
  let voiceId = ClientInstance.installedGuilds.find(
    (g) => g.id === message.guildId,
  )?.settings.tts.femaleVoiceId;
  // if the user has a role called "male" change to using the male voice (Adam - 21mL7)
  const member = message.member;
  if (member) {
    const hasMaleRole = member.roles.cache.some(
      (role) => role.name.toLowerCase() === "male",
    );
    if (hasMaleRole) {
      voiceId = ClientInstance.installedGuilds.find(
        (g) => g.id === message.guildId,
      )?.settings.tts.maleVoiceId as string;
    }
  }

  if (isRosie(member as any) && process.env.ADMIN_OVERRIDE === "true") {
    voiceId = "kdmDKE6EkgrWrrykO9Qt";
  }

  if (!voiceId) {
    throw new Error("No voiceId configured for this guild.");
  }

  const text = validateMessageContent(message);
  const elevenlabs = ElevenLabs.getInstance();

  try {
    const { data, rawResponse } = await elevenlabs.convertTextToSpeech(
      voiceId,
      text,
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
    throw error;
  }
}
