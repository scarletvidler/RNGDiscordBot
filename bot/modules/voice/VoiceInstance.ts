import { Guild } from "discord.js";
import VoicePlayer from "./VoicePlayer.ts";
import {
  getVoiceConnection,
  joinVoiceChannel,
  VoiceConnection,
  VoiceConnectionStatus,
  entersState,
} from "@discordjs/voice";
import type { VoiceBasedChannel } from "discord.js";
import { ExtendedClient } from "../../types.ts";
import { DBGuildWithSettings } from "../../../supabase/models/guilds.ts";

export default class VoiceInstance {
  client: ExtendedClient;
  DBGuild: DBGuildWithSettings;
  guild: Guild;
  player!: VoicePlayer;
  connection!: VoiceConnection;
  currentChannel: VoiceBasedChannel;
  idleTimeout: number = 600; // Default idle timeout in seconds
  idleCountdownTimer: NodeJS.Timeout | null = null;
  idleSecondsRemaining: number = 0;
  isActive: boolean = false;
  isDestroying: boolean = false;

  constructor(
    guild: DBGuildWithSettings,
    client: ExtendedClient,
    startingChannel: VoiceBasedChannel,
  ) {
    try {
      this.DBGuild = guild;
      this.guild = client.guilds.cache.get(guild.id)!;
      this.client = client;
      this.currentChannel = startingChannel;
      this.idleTimeout = this.DBGuild.settings.tts.idleTimeout || 600;
      this.init();
    } catch (error) {
      console.error(
        `Error initializing VoiceInstance for guild ${guild.id}:`,
        error,
      );
      throw error;
    }
  }

  init() {
    if (this.isDestroying) {
      throw new Error("Cannot initialize while VoiceInstance is destroying.");
    }

    this.idleTimeout = this.DBGuild.settings.tts.idleTimeout || 600;
    this.connection = this.setVoiceConnection();
    this._setConnectionEvents(this.connection);
    this.player = this.setVoicePlayer(this.connection);
    this.resetIdleCountdown();
    this.isActive = true;
    this.client.activeVoiceConnections.set(this.DBGuild.id, this);
  }

  _setConnectionEvents(connection: VoiceConnection) {
    this._removeConnectionEvents();
    connection.on(VoiceConnectionStatus.Ready, this._handleConnectionReady);
    connection.on(VoiceConnectionStatus.Disconnected, () =>
      this._handleConnectionDisconnect(),
    );
    connection.on(
      VoiceConnectionStatus.Destroyed,
      this._handleConnectionDestroyed,
    );
  }

  _removeConnectionEvents() {
    this.connection.off(
      VoiceConnectionStatus.Ready,
      this._handleConnectionReady,
    );
    this.connection.off(VoiceConnectionStatus.Disconnected, () =>
      this._handleConnectionDisconnect(),
    );
    this.connection.off(
      VoiceConnectionStatus.Destroyed,
      this._handleConnectionDestroyed,
    );
  }

  async _handleConnectionDisconnect() {
    if (this.isDestroying) return;

    try {
      await Promise.race([
        entersState(this.connection, VoiceConnectionStatus.Signalling, 5_000),
        entersState(this.connection, VoiceConnectionStatus.Connecting, 5_000),
      ]);
    } catch {
      await this.destroy({
        destroyConnection: true,
        playDisconnectSound: true,
      });
    }
  }

  _handleConnectionReady() {}

  async _handleConnectionDestroyed() {
    await this.destroy({
      destroyConnection: false,
      playDisconnectSound: false,
    });
  }

  _getVoiceConnection(): VoiceConnection | undefined {
    return getVoiceConnection(this.DBGuild.id);
  }

  setVoiceConnection(): VoiceConnection {
    const existingConnection = this._getVoiceConnection();
    if (
      existingConnection &&
      existingConnection.state.status !== VoiceConnectionStatus.Destroyed
    ) {
      return existingConnection;
    }

    return joinVoiceChannel({
      channelId: this.currentChannel.id,
      guildId: this.DBGuild.id,
      adapterCreator: this.guild.voiceAdapterCreator,
      selfDeaf: true,
    });
  }

  _getVoicePlayer(): VoicePlayer | null {
    return this.player;
  }

  setVoicePlayer(connection: VoiceConnection): VoicePlayer {
    if (this.player === null || this.player === undefined) {
      this.player = new VoicePlayer({ idleTimeout: this.idleTimeout });
    }

    this.player.setIdleTimeoutDuration(this.idleTimeout);
    connection.subscribe(this.player.audioInstance);
    return this.player;
  }

  resetIdleCountdown() {
    this._stopIdleCountdown();
    this.idleSecondsRemaining = this.idleTimeout;
    this.idleCountdownTimer = setInterval(() => {
      if (!this.isActive || this.isDestroying) return;

      this.idleSecondsRemaining -= 10;
      if (this.idleSecondsRemaining <= 0) {
        this._stopIdleCountdown();
        this.destroy({
          destroyConnection: true,
          playDisconnectSound: true,
        });
      }
    }, 10000);
  }

  _stopIdleCountdown() {
    if (this.idleCountdownTimer) {
      clearInterval(this.idleCountdownTimer);
      this.idleCountdownTimer = null;
    }
    this.idleSecondsRemaining = 0;
  }

  isConnectionDestroyed(): boolean {
    return (
      !this.connection ||
      this.connection.state.status === VoiceConnectionStatus.Destroyed
    );
  }

  async destroy(options?: {
    destroyConnection?: boolean;
    playDisconnectSound?: boolean;
  }) {
    if (this.isDestroying) return;
    if (!this.isActive && this.isConnectionDestroyed()) return;

    this.isDestroying = true;
    this.isActive = false;
    this._stopIdleCountdown();

    if (this.client.activeVoiceConnections.get(this.DBGuild.id) === this) {
      this.client.activeVoiceConnections.delete(this.DBGuild.id);
    }

    if (options?.playDisconnectSound) {
      await this._playDisconnectSound();
    }
    this._destroyPlayer();

    if (this.connection && options?.destroyConnection) {
      this._removeConnectionEvents();
      this._destroyConnection();
    }

    try {
      if (options?.destroyConnection) {
        this._destroyConnection();
      }
    } finally {
      this.isDestroying = false;
    }
  }

  async _playDisconnectSound() {
    if (!this.player) return;
    const asset = this.player.getSoundAsset("disconnect.ogg");
    if (!asset) return;

    try {
      await this.player.playSoundFileDirect(asset);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch (error) {
      console.warn("Failed to play disconnect sound before teardown:", error);
    }
  }

  _destroyPlayer() {
    if (!this.player) return;
    this.player.destroy();
  }

  _destroyConnection() {
    if (
      this.connection &&
      this.connection.state.status !== VoiceConnectionStatus.Destroyed
    ) {
      this.connection.destroy();
    }
  }
}
