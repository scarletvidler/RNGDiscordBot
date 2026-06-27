import { Message, Role } from "discord.js";
import clientInstance from "../client.ts";

export default function isValidTTS(message: Message<true>): boolean {
  const guild = clientInstance.installedGuilds.find(
    (g) => g.id === message.guildId,
  );
  const ttsChannel = guild?.settings.tts.ttsChannelName || "tts";
  const roomPrefixEnabled = guild?.settings.tts.roomPrefixEnabled ?? false;
  const maxLength = 400;

  if (message.pinned) return false;
  if (roomPrefixEnabled) {
    if (!message.content.trim().startsWith("/t")) return false;
  } else if (message.channel.name !== ttsChannel) {
    return false;
  }

  const memberRoles = message.member?.roles.cache;
  // Test if any of the users has a role named "Lerche  Listens or Amelia Listens, to allow for more flexible role management
  const hasLercheListensRole = memberRoles?.some(
    (role: Role) => role.name === "Lerche Listens",
  );
  const hasAmeliaListensRole = memberRoles?.some(
    (role: Role) => role.name === "Amelia Listens",
  );

  if (!hasLercheListensRole && !hasAmeliaListensRole) {
    throw new Error(
      "User does not have permission to use TTS. Must have either Lerche or Amelia role.",
    );
  }

  const ttsContent = getTTSContent(message.content, roomPrefixEnabled);

  if (ttsContent.length === 0)
    throw new Error("TTS message cannot be empty.");
  if (
    ttsContent.length > maxLength &&
    message.member?.id !== clientInstance.ownerId
  )
    throw new Error(
      `TTS message exceeds maximum length of ${maxLength} characters.`,
    );

  return true;
}

function getTTSContent(content: string, roomPrefixEnabled: boolean): string {
  const trimmed = content.trim();
  if (!roomPrefixEnabled) return trimmed;
  return trimmed.replace(/^\/t(?:\s+|$)/i, "").trim();
}
