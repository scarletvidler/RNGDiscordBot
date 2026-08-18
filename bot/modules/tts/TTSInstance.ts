import { Message, TextChannel } from "discord.js";
import { TTSModels, type ExtendedClient } from "../../types.ts";
import { insertGuildChatLog } from "../../../supabase/models/chatLogs.ts";
import { upsertGuildMember } from "../../../supabase/models/users.ts";
import {
  DBGuildWithSettings,
  DBupdateGuild,
} from "../../../supabase/models/guilds.ts";
import { shouldSendUsageMessage, usageMessage } from "../supportMessages.ts";
import VoiceInstance from "../voice/VoiceInstance.ts";
import convertToSpeech from "./convertToSpeech.ts";
import allowedMessage from "../../helpers/allowedMessage.ts";
import { canLerchePerformAction } from "../permissions/index.ts";
import { getCleanDisplayName } from "../../helpers/getClean.ts";
import type {
  DBVoiceUser,
  DBVoiceRole,
} from "../../../supabase/models/voice.ts";
import {
  getRolesVoices,
  getUserVoice,
} from "../../../supabase/models/voice.ts";

export class TTSInstance {
  private message: Message<true>;
  public channel: TextChannel;
  public reply?: Message;
  private guild: DBGuildWithSettings;
  private client: ExtendedClient;
  private voice: DBVoiceUser | DBVoiceRole | null = null;
  private provider: string;

  constructor(
    message: Message<true>,
    guild: DBGuildWithSettings,
    client: ExtendedClient,
  ) {
    this.message = message;
    this.provider = guild.settings.tts.tts_provider ?? TTSModels.ElevenLabsV3;
    this.guild = guild;
    this.channel = message.channel as TextChannel;
    this.client = client;
  }

  checkIfRepliesAreEnabled(): boolean {
    return this.guild.settings.tts.replies_enabled ?? true; // Default to true if not set
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
      if (!(await this._canRunTTS())) {
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
          this.guild.settings.tts.tts_ping_sound_enabled &&
          voiceInstance.player.soundQueue.length === 0 &&
          !voiceInstance.player.isPlaying
        ) {
          const pingAsset = voiceInstance.player.getSoundAsset("ping.ogg");
          if (pingAsset) voiceInstance.player.playSoundFile(pingAsset);
        }

        if (this.guild.settings.tts.tts_say_users_name == true) {
          const userName = getCleanDisplayName(this.message.member);
          this.message.content = `${userName} says: ${this.message.content}`;
        }

        await this._setVoiceData();
        this._setVoiceProvider(this.voice);

        const { audio, playedMessage, tokensUsed } =
          await this.getConvertedTTSMessage(this.message);
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

  async _canRunTTS(): Promise<boolean> {
    try {
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
        return false;
      }
      return true;
    } catch (error) {
      console.error("Error checking if TTS can run:", error);
      return false;
    }
  }

  async _setVoiceData(): Promise<boolean> {
    // Check  message's user id for voice
    // if not found, check the user's roles for voice
    const userId = this.message.author.id;

    console.log(
      `Checking voice data for user ${userId} in guild ${this.guild.id}`,
    );

    const cachedUser = this.guild.users.find((user) => user.id === userId);
    if (cachedUser?.voice) {
      console.log(
        `Found cached voice data for user ${userId} in guild ${this.guild.id}`,
      );
      this.voice = cachedUser.voice;
      return true;
    }
    console.log(
      `No cached voice data for user ${userId} in guild ${this.guild.id}. Checking database...`,
    );

    const userVoice = await getUserVoice(this.guild.id, userId);

    if (userVoice) {
      this.voice = userVoice;
      this.guild.users.push({ id: userId, voice: userVoice });
      return true;
    }
    const roleVoice = await getRolesVoices(
      this.guild.id,
      Array.from(this.message.member!.roles.cache.keys()),
    );
    if (roleVoice.length > 0) {
      this.voice = roleVoice[0];
      this.guild.users.push({ id: userId, voice: roleVoice[0] });
      return true;
    }
    this.voice = null;
    return false;
  }

  _setVoiceProvider(voice: DBVoiceUser | DBVoiceRole | null) {
    if (voice && voice.voice_provider) {
      this.provider = voice.voice_provider;
    } else {
      this.provider =
        this.guild.settings.tts.tts_provider ?? TTSModels.ElevenLabsV3;
    }
  }

  async getConvertedTTSMessage(
    message: Message<true>,
  ): Promise<{ audio: any; playedMessage: string; tokensUsed: number }> {
    const { audio, playedMessage, tokensUsed } = await convertToSpeech(
      message,
      this.voice,
      this.provider,
    );
    console.log(
      `Audio stream received from ${this.provider} with ${tokensUsed} tokens used.`,
    );
    return { audio, playedMessage, tokensUsed };
  }

  // TODO: MOVE TO GUILD CLASS
  getMessageCount(): number {
    try {
      return this.guild.settings.logging?.message_count ?? 0;
    } catch (error) {
      console.error("Error retrieving message count:", error);
      throw new Error("Failed to retrieve message count.");
    }
  }

  updateMessageCount(count?: number): number {
    try {
      const newCount = count ?? this.getMessageCount() + 1;
      this.guild.settings.logging.message_count = newCount;
      DBupdateGuild({ id: this.guild.id, message_count: newCount });
      return newCount;
    } catch (error) {
      console.error("Error setting message count:", error);
      throw new Error("Failed to set message count.");
    }
  }

  getUsageLimits(): number {
    try {
      const { token_balance } = this.guild.settings.logging;
      return token_balance;
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
      const previousTotalUsage = this.guild.settings.logging!.token_total_usage;
      const newBalance =
        this.guild.settings.logging!.token_balance - tokensUsed >= 0
          ? this.guild.settings.logging!.token_balance - tokensUsed
          : 0;
      const nextTotalUsage = previousTotalUsage + tokensUsed;

      this.guild.settings.logging!.token_balance = newBalance;
      this.guild.settings.logging!.token_total_usage = nextTotalUsage;

      await DBupdateGuild({
        id: this.guild.id,
        token_balance: this.guild.settings.logging!.token_balance,
        token_total_usage: this.guild.settings.logging!.token_total_usage,
      });

      if (
        shouldSendUsageMessage(previousTotalUsage, nextTotalUsage, this.guild)
      ) {
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
        ttsMode: this.guild.settings.tts.room_prefix_enabled
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
        `🎙️ Count: ${this.guild.settings.logging?.message_count ?? 0}`,
      );
    } catch (error) {
      console.error("Error logging TTS message details:", error);
      throw new Error("Failed to log TTS message details.");
    }
  }
}
