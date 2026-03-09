import { getVoiceConnection } from "@discordjs/voice";
import { joinAndPlay } from "../modules/ttsListen.js";

export default {
  type: "messageCreate",
  execute: async (message, client) => {
    let reply;
    const channel = message.channel;
    try {
      if (message.author.bot) return;

      /* Check if the message is in the TTS channel */
      if (
        message.channel.name === "tts" &&
        (message.author.id === client.scarletId ||
          message.member?.roles.cache.has(client.lercheRoleId))
      ) {
        if (!channel.isTextBased()) return;
        reply = await channel.send("Listening for TTS messages...");

        /*  Handle TTS message */
        try {
          if (message.member?.voice.channel) {
            await joinAndPlay(message.member.voice.channel, message);

            await reply?.edit("Message played in voice channel.");
          }
        } catch (error) {
          const failedConnection = getVoiceConnection(message.guild.id);
          if (failedConnection) {
            failedConnection.destroy();
          }
          console.error("Error handling TTS message:", error.message);
          message.react("❌");
          // Send a message to the same channel
          if (channel && channel.isTextBased()) {
            channel.send(
              `There was an error processing the TTS message. Please try again later.`,
            );
          }
        }
      } else {
        /* Not a TTS message, ignore */
        return;
      }
    } catch (error) {
      console.error("Error in messageCreate event:", error);
      message.react("❌");
      // Send a message to the same channel
      if (channel && channel.isTextBased()) {
        channel.send(
          `There was an unexpected error processing your message. Please try again later.`,
        );
      }
    }
  },
};
