import { Message } from "discord.js";
import { joinAndPlay } from "../ttsListen.ts";


export class TTSInstance {
  private message: Message<boolean>;
  public channel: Message["channel"];
  public reply?: Message;

  constructor(message: Message<boolean>) {
    this.message = message;
    this.channel = message.channel;
    console.log("TTS module initialized.");
    this.init();
  }

  private async init() {
      this.reply = await this.sendMessage('Listening for TTS messages...');
  }

  async sendMessage(messageToSet: string) {
    try {
      return await this.channel.send(messageToSet);
    } catch (error) {
      console.error("Error sending TTS message:", error);
      throw new Error("Failed to send TTS message.");
    }
  }

  async run() {
    try {
      // Placeholder for TTS logic, e.g., converting text to speech and playing it in a voice channel
      console.log("Running TTS for message:", this.message.content);
      if (this.message.member && this.message.member.voice.channel) {
        await joinAndPlay(this.message.member.voice.channel, this.message);
        if (this.reply) {
          await this.reply.edit("Message played in voice channel.");
        }
      } else {
        console.warn("User is not in a voice channel. Cannot play TTS.");
        this.reply = await this.channel.send("Please join a voice channel to hear the TTS message.");
      }
    } catch (error) {
      console.error("Error running TTS:", error);
      throw new Error("Failed to run TTS.");
    }
  }

}
