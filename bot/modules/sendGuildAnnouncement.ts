import type { Guild, TextChannel } from "discord.js";

const DEFAULT_UPDATES_CHANNEL_NAME = "lerche-updates";

export type AnnouncementResult = {
  guildName: string;
  ok: boolean;
  reason?: string;
};

export async function sendGuildAnnouncement(
  guild: Guild,
  message: string,
  channelName = DEFAULT_UPDATES_CHANNEL_NAME,
): Promise<AnnouncementResult> {
  try {
    const channels = await guild.channels.fetch();
    const channel = channels.find(
      (c) => c?.name === channelName && c.isTextBased(),
    ) as TextChannel | undefined;

    if (!channel) {
      return {
        guildName: guild.name,
        ok: false,
        reason: `no "${channelName}" channel`,
      };
    }

    await channel.send(message);
    return { guildName: guild.name, ok: true };
  } catch (error) {
    return {
      guildName: guild.name,
      ok: false,
      reason: getErrorMessage(error),
    };
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
