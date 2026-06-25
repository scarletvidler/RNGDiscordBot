import { Guild, Message, TextChannel } from "discord.js";
import { joinAndPlay } from "../ttsListen.ts";
import { ExtendedGuild } from "../../types.ts";

export class TTSInstance {
  private message: Message<boolean>;
  public channel: TextChannel;
  public reply?: Message;
  private guild: ExtendedGuild;

  constructor(message: Message<boolean>, guild: ExtendedGuild) {
    this.message = message;
    this.guild = guild;
    this.channel = message.channel as TextChannel;
  }

  checkIfRepliesAreEnabled(): boolean {
    return this.guild.settings.tts.repliesEnabled ?? true; // Default to true if not set
  }

  static async create(
    message: Message<boolean>,
    guild: ExtendedGuild,
  ): Promise<TTSInstance> {
    const instance = new TTSInstance(message, guild);
    instance.reply = await instance.sendMessage(
      "Listening for TTS messages...",
    );
    return instance;
  }

  async sendMessage(messageToSet: string) {
    try {
      if (!this.checkIfRepliesAreEnabled()) {
        console.log("Replies are disabled for this guild. Skipping reply.");
        return;
      }
      // Create an ephemeral reply to the user to confirm that their TTS message is being processed
      return await this.channel.send(messageToSet);
    } catch (error) {
      console.error("Error sending TTS message:", error);
      throw new Error("Failed to send TTS message.");
    }
  }

  async run() {
    try {
      // Placeholder for TTS logic, e.g., converting text to speech and playing it in a voice channel
      if (this.message.member && this.message.member.voice.channel) {
        const { messagePlayed } = await joinAndPlay(
          this.message.member.voice.channel,
          this.message,
        );
        if (this.reply) {
          await this.reply.edit("Message played in voice channel.");
        }

        if (this.setMessageCount() % 100 === 0) {
          await this.channel.send(
            `👋 Thanks for supporting Lerche's development! Please share the bot with your friends and community! It helps me make this into a real project. https://discord.com/oauth2/authorize?client_id=1511773768438251660`,
          );
        }
        this.logMessageDetails(messagePlayed);
      } else {
        console.warn("User is not in a voice channel. Cannot play TTS.");
        this.reply?.edit(
          "Please join a voice channel to hear the TTS message.",
        );
      }
    } catch (error) {
      console.error("Error running TTS:", error);
      throw new Error("Failed to run TTS.");
    }
  }

  logMessageDetails(text: string) {
    try {
      console.log(
        `⚔️ Guild: ${this.message.guild?.name}`,
        `📢 User: ${this.message.author.username}`,
        `📜 Message: ${text}`,
        `🎙️ Count: ${this.guild.logging?.messageCount ?? 0}`,
      );
    } catch (error) {
      console.error("Error logging TTS message details:", error);
      throw new Error("Failed to log TTS message details.");
    }
  }

  setMessageCount(): number {
    try {
      if (!this.guild.logging) {
        this.guild.logging = { messageCount: 0 };
      }
      this.guild.logging.messageCount += 1;
      console.log(
        `Current message count for ${this.guild.name}: ${this.guild.logging.messageCount}`,
      );
      return this.guild.logging.messageCount;
    } catch (error) {
      console.error("Error logging TTS message:", error);
      throw new Error("Failed to log TTS message.");
    }
  }
}
