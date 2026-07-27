import { Message, TextChannel } from "discord.js";
import type { ExtendedClient } from "../../types.ts";
import { insertGuildChatLog } from "../../../supabase/models/chatLogs.ts";
import { upsertGuildMember } from "../../../supabase/models/users.ts";
import {
  DBGuildWithSettings,
  saveGuildSettings,
} from "../../../supabase/models/guilds.ts";
import { shouldSendUsageMessage, usageMessage } from "../supportMessages.ts";
import VoiceInstance from "../voice/VoiceInstance.ts";
import convertToSpeech from "./convertToSpeech.ts";
import invariant from "tiny-invariant";
import allowedMessage from "../../helpers/allowedMessage.ts";
import { canLerchePerformAction } from "../permissions/index.ts";

export class TTSInstance {
  private message: Message<true>;
  public channel: TextChannel;
  public reply?: Message;
  private guild: DBGuildWithSettings;
  private client: ExtendedClient;

  constructor(
    message: Message<true>,
    guild: DBGuildWithSettings,
    client: ExtendedClient,
  ) {
    this.message = message;
    this.guild = guild;
    this.channel = message.channel as TextChannel;
    this.client = client;
  }

  checkIfRepliesAreEnabled(): boolean {
    return this.guild.settings.tts.repliesEnabled ?? true; // Default to true if not set
  }

  static async create(
    message: Message<true>,
    guild: DBGuildWithSettings,
    client: ExtendedClient,
  ): Promise<TTSInstance> {
    const instance = new TTSInstance(message, guild, client);
    instance.reply = await instance.sendMessage(
      "Listening for TTS messages...",
    );
    return instance;
  }

  async sendMessage(messageToSend: string) {
    try {
      if (!this.checkIfRepliesAreEnabled()) {
        console.log("Replies are disabled for this guild. Skipping reply.");
        return;
      }
      // Create an ephemeral reply to the user to confirm that their TTS message is being processed
      const results = await allowedMessage(this.message);
      if (!results.allowed) {
        console.warn(
          `Lerche does not have permission to send messages in the channel "${this.channel.name}". Missing permissions: ${results.missingPermissions.join(", ")}. Skipping reply.`,
        );
        return;
      }
      const sentMessage = await this.channel.send(messageToSend);
      return sentMessage;
    } catch (error) {
      console.log(
        `Failed to send message in channel ${this.channel.id} (${this.channel.name}, guild: ${this.guild.name}, message: ${this.message.id})`,
      );
      console.error("Error sending TTS message:", error);
    }
  }

  async run() {
    let voiceInstance = this.client.activeVoiceConnections.get(this.guild.id);
    try {
      // Get or create a VoiceInstance for the guild and join the user's voice channel to play the TTS message

      const canJoin = await canLerchePerformAction(
        this.message.guild,
        ["Connect", "Speak", "ViewChannel"],
        this.message.member?.voice.channel!,
      );

      if (!canJoin.allowed) {
        console.warn(
          `Lerche does not have permission to join the voice channel "${this.message.member?.voice.channel?.name}". Missing permissions: ${canJoin.missingPermissions.join(", ")}. Cannot play TTS.`,
        );
        await this.reply?.edit(
          `Lerche does not have permission to join the voice channel "${this.message.member?.voice.channel?.name}". Missing permissions: ${canJoin.missingPermissions.join(", ")}. Cannot play TTS.`,
        );
        return;
      }

      if (this.message.member && this.message.member.voice.channel) {
        if (!voiceInstance) {
          voiceInstance = new VoiceInstance(
            this.guild,
            this.client,
            this.message.member.voice.channel!,
          );
        }
        voiceInstance.resetIdleCountdown();

        if (
          this.guild.settings.tts.pingSoundEnabled &&
          voiceInstance.player.soundQueue.length === 0 &&
          !voiceInstance.player.isPlaying
        ) {
          const pingAsset = voiceInstance.player.getSoundAsset("ping.ogg");
          if (pingAsset) voiceInstance.player.playSoundFile(pingAsset);
        }

        if (this.guild.settings.tts.ttsSayUsersName == true) {
          const userName = this.message.member.displayName;
          this.message.content = `${userName} says: ${this.message.content}`;
        }

        const { audio, playedMessage, tokensUsed } =
          await this.convertToTTSMessage(this.message);
        voiceInstance.player.playSoundFile(audio);
        voiceInstance.resetIdleCountdown();

        if (this.reply) {
          await this.reply.edit("Message played in voice channel.");
        }

        if (this.updateMessageCount() % 100 === 0) {
          await this.channel.send(
            `👋 Thanks for supporting Lerche's development! If you're enjoying Lerche, please consider leaving a review on Top.gg! 
https://top.gg/bot/1511773768438251660#reviews`,
          );
        }
        this.logMessageDetails(playedMessage);
        await this.logMessageToSupabase(playedMessage);
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

  async convertToTTSMessage(
    message: Message<true>,
  ): Promise<{ audio: any; playedMessage: string; tokensUsed: number }> {
    const { audio, playedMessage, tokensUsed } = await convertToSpeech(message);
    console.log(
      `Audio stream received from ElevenLabs with ${tokensUsed} tokens used.`,
    );
    return { audio, playedMessage, tokensUsed };
  }

  // TODO: MOVE TO GUILD CLASS
  getMessageCount(): number {
    try {
      return this.guild.settings.logging?.messageCount ?? 0;
    } catch (error) {
      console.error("Error retrieving message count:", error);
      throw new Error("Failed to retrieve message count.");
    }
  }

  updateMessageCount(count?: number): number {
    try {
      const newCount = count ?? this.getMessageCount() + 1;
      this.guild.settings.logging!.messageCount = newCount;
      saveGuildSettings(this.guild.id, { message_count: newCount });
      return newCount;
    } catch (error) {
      console.error("Error setting message count:", error);
      throw new Error("Failed to set message count.");
    }
  }

  getUsageLimits(): number {
    try {
      const { tokenBalance } = this.guild.settings.logging;
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
      const previousTotalUsage = this.guild.settings.logging!.tokenTotalUsage;
      const newBalance =
        this.guild.settings.logging!.tokenBalance - tokensUsed >= 0
          ? this.guild.settings.logging!.tokenBalance - tokensUsed
          : 0;
      const nextTotalUsage = previousTotalUsage + tokensUsed;

      this.guild.settings.logging!.tokenBalance = newBalance;
      this.guild.settings.logging!.tokenTotalUsage = nextTotalUsage;

      await saveGuildSettings(this.guild.id, {
        token_balance: this.guild.settings.logging!.tokenBalance,
        token_total_usage: this.guild.settings.logging!.tokenTotalUsage,
      });

      if (
        shouldSendUsageMessage(previousTotalUsage, nextTotalUsage, this.guild)
      ) {
        console.log(
          `Sending usage message. Previous total usage: ${previousTotalUsage}, Next total usage: ${nextTotalUsage}`,
        );
        await this.channel.send(usageMessage(nextTotalUsage, this.guild));
      }
    } catch (error) {
      console.error("Error updating usage:", error);
      throw new Error("Failed to update usage.");
    }
  }

  async logMessageToSupabase(text: string) {
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
        `🎙️ Count: ${this.guild.settings.logging?.messageCount ?? 0}`,
      );
    } catch (error) {
      console.error("Error logging TTS message details:", error);
      throw new Error("Failed to log TTS message details.");
    }
  }
}
