import { TextChannel, type Message } from "discord.js";
import type { BotEvent, ExtendedClient } from "../types.ts";
import isValidTTS from "../modules/tts/isValidTTS.ts";
import { TTSInstance } from "../modules/tts/TTSInstance.ts";

const ANNOUNCE_GUILD_ID = "1179157503766962176";
const ANNOUNCE_CHANNEL_NAME = "announce";
const UPDATES_CHANNEL_NAME = "lerche-updates";

const event: BotEvent<[Message<boolean>, ExtendedClient]> = {
  type: "messageCreate",
  execute: async (message, client) => {
    if (message.author.bot) return;
    if (!message.inGuild()) return;

    if (
      message.guildId === ANNOUNCE_GUILD_ID &&
      (message.channel as TextChannel).name === ANNOUNCE_CHANNEL_NAME
    ) {
      for (const guild of client.guilds.cache.values()) {
        const channels = await guild.channels.fetch();
        const target = channels.find(
          (c) => c?.name === UPDATES_CHANNEL_NAME && c.isTextBased(),
        ) as TextChannel | undefined;
        if (target) await target.send(message.content);
      }
      return;
    }

    try {
      if (isValidTTS(message)) {
        try {
          const guild = client.installedGuilds.find(
            (g) => g.id === message.guildId,
          );
          if (!guild) {
            console.error(`Guild not found for message: ${message.id}`);
            return;
          }
          const tts = await TTSInstance.create(message, guild);
          await tts.run();
        } catch (error) {
          console.error("Error processing TTS message:", error);
          await message.channel.send(
            "There was an error processing your TTS message. Please try again later.",
          );
        }
      }
    } catch (error) {
      console.error("TTS validation error:", error);
      await message.channel.send(`TTS validation failed: ${error.message}`);
    }
  },
};

export default event;
