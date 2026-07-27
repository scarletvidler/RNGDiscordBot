import type { Message } from "discord.js";
import { ExtendedClient } from "../types.ts";
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
