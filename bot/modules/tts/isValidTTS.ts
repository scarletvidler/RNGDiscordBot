import { Message } from "discord.js";
import clientInstance from "../client.ts";

export default function isValidTTS(message: Message): boolean {
    // TODO: Refactor this to use the guild class system from the TODO //
    const ttsChannel = clientInstance.ttsChannelName || "tts";
    const maxLength = 400;

    if (message.pinned) return false;
    if (message.channel.name !== ttsChannel) return false;

    // if user has lercheRoleId or ameliaRoleId, allow them to talk
    const memberRoles = message.member?.roles.cache;
    const hasLercheRole = memberRoles?.has(clientInstance.lercheRoleId);
    const hasAmeliaRole = memberRoles?.has(clientInstance.ameliaRoleId);

    if (!hasLercheRole && !hasAmeliaRole) {
        throw new Error("User does not have permission to use TTS. Must have either Lerche or Amelia role.");
    }

    if (message.content.length === 0) throw new Error("TTS message cannot be empty.");
    if (message.content.length > maxLength) throw new Error(`TTS message exceeds maximum length of ${maxLength} characters.`);


    return true;
}