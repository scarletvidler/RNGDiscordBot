import { Message, Role } from "discord.js";
import clientInstance from "../client.ts";

export default function isValidTTS(message: Message): boolean {
  // TODO: Refactor this to use the guild class system from the TODO //
  const ttsChannel = clientInstance.ttsChannelName || "tts";
  const maxLength = 400;

  if (message.pinned) return false;
  if (message.channel.name !== ttsChannel) return false;

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

  if (message.content.length === 0)
    throw new Error("TTS message cannot be empty.");
  if (
    message.content.length > maxLength &&
    message.member?.id !== clientInstance.ownerId
  )
    throw new Error(
      `TTS message exceeds maximum length of ${maxLength} characters.`,
    );

  return true;
}
