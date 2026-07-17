import type { Message } from "discord.js";
import ClientInstance from "../ClientInstance.ts";
import { getCleanName } from "../../helpers/getClean.ts";

export default function validateMessageContent(
  message: Message<boolean>,
): string {
  try {
    let content = message.content.trim();
    const roomPrefixEnabled =
      ClientInstance.installedGuilds.find((g) => g.id === message.guildId)
        ?.settings.tts.roomPrefixEnabled ?? false;

    if (roomPrefixEnabled) {
      content = content.replace(/^\/t(?:\s+|$)/i, "").trim();
    }

    content = content.replace(/\n/g, " ");

    message.mentions.users.forEach((user) => {
      console.log(user.globalName?.match(/^[\x00-\x7F]+$/));
      const name = getCleanName(user);
      content = content.replace(`<@${user.id}>`, name);
    });

    const urlRegex = /(https?:\/\/[^\s]+)/g;
    content = content.replace(urlRegex, (match) => {
      const url = new URL(match);
      return `A link to $${url.hostname} was sent by ${getCleanName(
        message.author,
      )}`;
    });

    return content;
  } catch (error) {
    const err = error as Error;
    console.error("Error processing message content:", err);
    return `Sorry, I couldn't process that message. Here is why: ${err.message}`;
  }
}
