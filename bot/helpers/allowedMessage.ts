import type { Message } from "discord.js";
import { ExtendedClient } from "../types.ts";
import Guild from "discord.js";
import {
  canLerchePerformAction,
  PermissionName,
} from "../modules/permissions/index.ts";

export default async function allowedMessage(
  message: Message<true>,
): Promise<boolean> {
  if (!message.guild) return false;

  // Check if Lerche has permissions to send messages in the channel
  const result = await canLerchePerformAction(
    message.guild,
    [PermissionName.SendMessages, PermissionName.ViewChannel],
    message.channel,
  );
  return result.allowed;
}

export async function allowedToJoinChannel(
  client: ExtendedClient,
  guild: Guild,
  channel: Guild.Channel,
): Promise<boolean> {
  if (!guild) return false;
  if (!channel || !channel.isVoiceBased()) return false;

  const result = await canLerchePerformAction(
    guild,
    ["Connect", "Speak", "ViewChannel"],
    channel,
  );
  return result.allowed;
}
