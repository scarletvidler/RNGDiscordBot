import { Message, Role } from "discord.js";
import ClientInstance from "../ClientInstance.ts";
import isRosie from "../../helpers/isRosie.ts";

export default function isValidTTS(message: Message<true>): boolean {
  const guild = ClientInstance.installedGuilds.find(
    (g) => g.id === message.guildId,
  );
  const ttsChannel = guild?.settings.tts.ttsChannelName || "tts";
  const roomPrefixEnabled = guild?.settings.tts.roomPrefixEnabled ?? false;
  const maxLength = 300;

  if (message.pinned) return false;
  if (roomPrefixEnabled) {
    if (!message.content.trim().startsWith("/t")) return false;
  } else if (message.channel.name !== ttsChannel) {
    return false;
  }

  const memberRoles = message.member?.roles.cache;
  // Test if any of the users has a role named "Lerche  Listens, to allow for more flexible role management
  const hasLercheListensRole = memberRoles?.some(
    (role: Role) => role.name === "Lerche Listens",
  );

  if (!hasLercheListensRole && isRosie(message.member as any) === false) {
    console.log(
      `User ${message.author.username} from guild: ${message.guild?.name} (ID: ${message.guildId}) does not have permission to use TTS. Must have either Lerche Listens role or be Rosie.`,
    );
    throw new Error(
      "User does not have permission to use TTS. Must have either Lerche Listens",
    );
  }

  const ttsContent = getTTSContent(message.content, roomPrefixEnabled);

  if (ttsContent.length === 0) throw new Error("TTS message cannot be empty.");
  if (
    ttsContent.length > maxLength &&
    message.member?.id !== ClientInstance.ownerId
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
