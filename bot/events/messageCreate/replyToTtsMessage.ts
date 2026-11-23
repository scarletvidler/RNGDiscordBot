import type { Message, MessageReplyOptions } from "discord.js";

// Notifications must not turn into another TTS error (and another reply).
export async function replyToTtsMessage(
  message: Message<true>,
  options: string | MessageReplyOptions,
): Promise<void> {
  try {
    await message.reply(options);
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? error.code
        : undefined;
    // Do not log the REST error object: it can contain message payloads.
    console.warn("Could not send TTS reply", {
      guildId: message.guildId,
      channelId: message.channelId,
      messageId: message.id,
      code: typeof code === "number" ? code : undefined,
    });
  }
}
