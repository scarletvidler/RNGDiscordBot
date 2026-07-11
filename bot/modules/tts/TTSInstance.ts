import { Message, TextChannel } from "discord.js";
import { joinAndPlay } from "../ttsListen.ts";
import { ExtendedGuild } from "../../types.ts";
import { insertGuildChatLog } from "../../../supabase/modules/chatLogs.ts";
import { upsertGuildMember } from "../../../supabase/modules/users.ts";
import { saveGuildSettings } from "../../../supabase/modules/guild.ts";

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
        const { messagePlayed, tokensUsed } = await joinAndPlay(
          this.message.member.voice.channel,
          this.message,
          this.guild,
        );
        if (this.reply) {
          await this.reply.edit("Message played in voice channel.");
        }

        if (this.updateMessageCount() % 100 === 0) {
          await this.channel.send(
            `👋 Thanks for supporting Lerche's development! If you're enjoying Lerche, please consider leaving a review on Top.gg! 
https://top.gg/bot/1511773768438251660#reviews`,
          );
        }
        this.logMessageDetails(messagePlayed);
        await this.logMessageToSupabase(messagePlayed);
        await this.updateUsage(tokensUsed);
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

  // TODO: MOVE TO GUILD CLASS
  getMessageCount(): number {
    try {
      return this.guild.logging?.messageCount ?? 0;
    } catch (error) {
      console.error("Error retrieving message count:", error);
      throw new Error("Failed to retrieve message count.");
    }
  }

  updateMessageCount(count?: number): number {
    try {
      const newCount = count ?? this.getMessageCount() + 1;
      this.guild.logging!.messageCount = newCount;
      saveGuildSettings(this.guild.id, { message_count: newCount });
      return newCount;
    } catch (error) {
      console.error("Error setting message count:", error);
      throw new Error("Failed to set message count.");
    }
  }

  getUsageLimits(): number {
    try {
      const { tokenBalance } = this.guild.logging;
      return tokenBalance;
    } catch (error) {
      console.error("Error retrieving usage limits:", error);
      throw new Error("Failed to retrieve usage limits.");
    }
  }

  checkUsageLimits(): { operationAllowed: boolean; reason?: string } {
    let operationAllowed = false;
    let reason = "";
    try {
      const tokenBalance = this.getUsageLimits();
      if (tokenBalance <= 0) {
        reason = "Insufficient token balance.";
      } else {
        operationAllowed = true;
      }
    } catch (error) {
      console.error("Error checking usage limits:", error);
      throw new Error("Failed to check usage limits.");
    }
    return { operationAllowed, reason };
  }

  async updateUsage(tokensUsed: number): Promise<void> {
    try {
      const newBalance =
        this.guild.logging.tokenBalance - tokensUsed >= 0
          ? this.guild.logging.tokenBalance - tokensUsed
          : 0;
      this.guild.logging.tokenBalance = newBalance;
      this.guild.logging.tokenTotalUsage += tokensUsed;

      await saveGuildSettings(this.guild.id, {
        token_balance: this.guild.logging.tokenBalance,
        token_total_usage: this.guild.logging.tokenTotalUsage,
      });
    } catch (error) {
      console.error("Error updating usage:", error);
      throw new Error("Failed to update usage.");
    }
  }

  async logMessageToSupabase(text: string) {
    console.log("Logging TTS message to Supabase:", text);
    try {
      if (this.message.member) {
        await upsertGuildMember(this.message.member);
      }

      await insertGuildChatLog({
        message: this.message,
        spokenMessage: text,
        ttsMode: this.guild.settings.tts.roomPrefixEnabled
          ? "room_prefix"
          : "channel",
      });
    } catch (error) {
      console.error("Error logging TTS message to Supabase:", error);
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
}
