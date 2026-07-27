import type { Message } from "discord.js";
import type { BotEvent, ExtendedClient } from "../../types.ts";
import { PermissionName } from "../../modules/permissions/permissionNames.ts";
import { tryHandleAnnouncement } from "./announcement.ts";
import { isProcessableGuildMessage } from "./guards.ts";
import { handleTtsMessage } from "./tts.ts";
import { canLerchePerformAction } from "../../modules/permissions/index.ts";
import allowedMessage from "../../helpers/allowedMessage.ts";

const event: BotEvent<[Message<boolean>, ExtendedClient]> = {
  type: "messageCreate",
  execute: async (message, client) => {
    try {
      if (!isProcessableGuildMessage(message)) return;
      if (await tryHandleAnnouncement(message, client)) return;

      const allowed = await allowedMessage(message);

      if (!allowed.allowed) {
        // Attempt to send a DM to the user informing them of the missing permissions
        try {
          await message.author.send(
            `Lerche does not have the required permissions to send messages in the channel "${message.channel.name}". Missing permissions: ${allowed.missingPermissions.join(", ")}. if this is spamming you, please use tts-channel-name to set a channel for tts messages to something that doesn't exist`,
          );
        } catch (dmError) {
          console.error(
            `Failed to send DM to user ${message.author.tag} about missing permissions:`,
            dmError,
          );
        }
        return; // Stop further execution if Lerche doesn't have the required permissions
      }

      await handleTtsMessage(message, client);
    } catch (error) {
      console.error("Error in messageCreate event:", error);
    }
  },
};

export default event;
