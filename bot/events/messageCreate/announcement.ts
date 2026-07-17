import { TextChannel, type Message } from "discord.js";
import type { ExtendedClient } from "../../types.ts";
import { sendGuildAnnouncement } from "../../modules/sendGuildAnnouncement.ts";
import { ANNOUNCE_CHANNEL_NAME, ANNOUNCE_GUILD_ID } from "./constants.ts";

export async function tryHandleAnnouncement(
  message: Message<true>,
  client: ExtendedClient,
): Promise<boolean> {
  if (
    message.guildId !== ANNOUNCE_GUILD_ID ||
    (message.channel as TextChannel).name !== ANNOUNCE_CHANNEL_NAME
  ) {
    return false;
  }

  for (const guild of client.guilds.cache.values()) {
    const result = await sendGuildAnnouncement(guild, message.content);
    if (!result.ok) {
      console.warn(
        `Announcement skipped for ${result.guildName}: ${result.reason}`,
      );
    }
  }

  return true;
}
