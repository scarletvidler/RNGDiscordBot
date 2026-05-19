import { type Message } from "discord.js";
import type { BotEvent, ExtendedClient } from "../types.ts";
import isValidTTS from "../modules/tts/isValidTTS.ts";
import { TTSInstance } from "../modules/tts/TTSInstance.ts";

const event: BotEvent<[Message<boolean>, ExtendedClient]> = {
  type: "messageCreate",
  execute: async (message) => {
    if (message.author.bot) return;
    if (!message.inGuild()) return;

    if (isValidTTS(message)) {
      try {
        const ttsInstance = new TTSInstance(message);
        await ttsInstance.run();
      }
      catch (error) {
        console.error("Error processing TTS message:", error);
        await message.channel.send("There was an error processing your TTS message. Please try again later.");
      }
    }
  },
};

export default event;
