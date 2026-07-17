import type { Message } from "discord.js";

export function isProcessableGuildMessage(
  message: Message<boolean>,
): message is Message<true> {
  return !message.author.bot && message.inGuild();
}
