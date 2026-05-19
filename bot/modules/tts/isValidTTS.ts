import { Message } from "discord.js";
import clientInstance from "../client.ts";

export default function isValidTTS(message: Message): boolean {
    // TODO: Refactor this to use the guild class system from the TODO //
    const ttsChannel = clientInstance.ttsChannelName || "tts";
    const maxLength = 400;

    if (message.pinned) return false;
    if (message.channel.name !== ttsChannel) return false;

    if (message.content.length === 0) throw new Error("TTS message cannot be empty.");
    if (message.content.length > maxLength) throw new Error(`TTS message exceeds maximum length of ${maxLength} characters.`);


    return true;
}