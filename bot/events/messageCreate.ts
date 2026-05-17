import { getVoiceConnection } from "@discordjs/voice";
import { type Message } from "discord.js";
import { joinAndPlay } from "../modules/ttsListen.js";
import type { BotEvent, ExtendedClient } from "../types.js";

const event: BotEvent<[Message<boolean>, ExtendedClient]> = {
  type: "messageCreate",
  execute: async (message, client) => {
    if (message.author.bot) return;
    if (!message.inGuild()) return;

    const channel = message.channel;

    try {
      if (
        channel.name === "tts" &&
        (message.author.id === client.scarletId ||
          message.member?.roles.cache.has(client.lercheRoleId) ||
          message.member?.roles.cache.has(client.ameliaRoleId))
      ) {
        const reply = await channel.send("Listening for TTS messages...");

        try {
          if (message.member && message.member.voice.channel) {
            await joinAndPlay(message.member.voice.channel, message);
            await reply.edit("Message played in voice channel.");
          }
        } catch (error) {
          const failedConnection = getVoiceConnection(message.guild.id);
          if (failedConnection) {
            failedConnection.destroy();
          }
          const err = error as Error;
          console.error("Error handling TTS message:", err.message);
          message.react("❌");
          channel.send(
            "There was an error processing the TTS message. Please try again later.",
          );
        }
      }
    } catch (error) {
      console.error("Error in messageCreate event:", error);
      message.react("❌");
      channel.send(
        "There was an unexpected error processing your message. Please try again later.",
      );
    }
  },
};

export default event;
