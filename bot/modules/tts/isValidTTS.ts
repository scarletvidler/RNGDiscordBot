import { Message } from "discord.js";
import ClientInstance from "../ClientInstance.ts";
import isRosie from "../../helpers/isRosie.ts";

export default function isValidTTS(message: Message<true>): boolean {
  const guild = ClientInstance.installedGuilds.find(
    (g) => g.id === message.guildId,
  );
  const ttsChannel = guild?.settings.tts.tts_channel_name || "tts";
  const ttsChannelId = guild?.settings.tts.tts_channel_id;
  const roomPrefixEnabled = guild?.settings.tts.room_prefix_enabled ?? false;
  const maxLength = 300;

  if (message.pinned) return false;
  if (!guild?.settings.tts.setup_completed_at) return false;

  if (roomPrefixEnabled) {
    if (!/^\/t(?:\s+|$)/i.test(message.content.trim())) return false;
  } else if (
    ttsChannelId
      ? message.channel.id !== ttsChannelId
      : message.channel.name !== ttsChannel
  ) {
    return false;
  }

  const listenRoleId = guild.settings.tts.listen_role_id;
  const canUseTTS =
    listenRoleId === message.guildId ||
    (listenRoleId !== null &&
      message.member?.roles.cache.has(listenRoleId) === true) ||
    (listenRoleId === null &&
      message.member?.roles.cache.some(
        (role) => role.name === "Lerche Listens",
      )) ||
    isRosie(message.member as any);

  if (!canUseTTS) {
    console.log(
      `User ${message.author.username} from guild ${message.guild?.name} does not have the configured TTS role ${listenRoleId}.`,
    );
    throw new Error("You do not have the role required to use TTS.");
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
