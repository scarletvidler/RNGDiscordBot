import type { Message } from "discord.js";
import type { BotEvent, ExtendedClient } from "../../types.ts";
import { tryHandleAnnouncement } from "./announcement.ts";
import { isProcessableGuildMessage } from "./guards.ts";
import { handleTtsMessage } from "./tts.ts";

const event: BotEvent<[Message<boolean>, ExtendedClient]> = {
  type: "messageCreate",
  execute: async (message, client) => {
    if (!isProcessableGuildMessage(message)) return;
    if (await tryHandleAnnouncement(message, client)) return;
    await handleTtsMessage(message, client);
  },
};

export default event;
