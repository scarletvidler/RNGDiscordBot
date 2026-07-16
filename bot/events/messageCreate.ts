import { TextChannel, type Message } from "discord.js";
import type { BotEvent, ExtendedClient } from "../types.ts";
import invariant from "tiny-invariant";
import isValidTTS from "../modules/tts/isValidTTS.ts";
import { TTSInstance } from "../modules/tts/TTSInstance.ts";
import { sendGuildAnnouncement } from "../modules/sendGuildAnnouncement.ts";
import { getOrCreateDBGuild } from "../../supabase/models/guilds.ts";
import { setUpExtendedGuild } from "../modules/setUpGuilds.ts";

const ANNOUNCE_GUILD_ID = "1179157503766962176";
const ANNOUNCE_CHANNEL_NAME = "announce";

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
        const result = await sendGuildAnnouncement(guild, message.content);
        if (!result.ok) {
          console.warn(
            `Announcement skipped for ${result.guildName}: ${result.reason}`,
          );
        }
      }
      return;
    }

    try {
      if (isValidTTS(message)) {
        try {
          let guild = client.installedGuilds.find(
            (g) => g.id === message.guildId,
          );
          if (!guild) {
            invariant(guild, "Guild not found in installedGuilds");
            setUpExtendedGuild(message.guild, client).catch((error) => {
              throw new Error(
                `Failed to set up guild ${message.guildId} (${message.guild?.name})`,
              );
            });
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
      await message.channel.send(
        `TTS validation failed: ${getErrorMessage(error)}`,
      );
    }
  },
};

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export default event;
