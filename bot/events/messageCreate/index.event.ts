import type { Message } from "discord.js";
import type { BotEvent, ExtendedClient } from "../../types.ts";
import { tryHandleAnnouncement } from "./announcement.ts";
import { isProcessableGuildMessage } from "./guards.ts";
import { handleTtsMessage } from "./tts.ts";
import allowedMessage from "../../helpers/allowedMessage.ts";

const event: BotEvent<[Message<boolean>, ExtendedClient]> = {
  type: "messageCreate",
  execute: async (message, client) => {
    try {
      if (!isProcessableGuildMessage(message)) return;
      if (await tryHandleAnnouncement(message, client)) return;

      const allowed = await allowedMessage(message);

      if (!allowed.allowed) {
        return; // Stop further execution if Lerche doesn't have the required permissions
      }

      await handleTtsMessage(message, client);
    } catch (error) {
      console.error("Error in messageCreate event:", error);
    }
  },
};

export default event;
