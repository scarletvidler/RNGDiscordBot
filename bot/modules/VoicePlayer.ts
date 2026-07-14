import {
  AudioPlayer,
  AudioPlayerStatus,
  AudioResource,
  VoiceConnection,
  createAudioPlayer,
  createAudioResource,
} from "@discordjs/voice";
import { Readable } from "stream";
import getDirectoryRoot from "../helpers/getDirectoryRoot.ts";
import path from "path";
import fs from "fs";

export default class VoicePlayerClass {
  timeOfCreation: number;
  idleTimeout: number;
  idleTimer: number;
  isDisconnecting: boolean;
  connection: VoiceConnection | null;
  audioInstance: AudioPlayer;
  soundQueue: AudioResource[];

  constructor(options: { idleTimeout?: number } = {}) {
    this.timeOfCreation = Date.now();
    this.idleTimeout = options.idleTimeout || 600; // default to 10 minutes if not provided (in seconds)
    this.idleTimer = this.timeOfCreation;
    this.isDisconnecting = false;
    this.connection = null;
    this.soundQueue = [];
    this.audioInstance = createAudioPlayer();

    this._monitorIdleState();
    this._handleEvents();
  }

  _setConnection(connection: VoiceConnection) {
    this.connection = connection;
  }

  _monitorIdleState() {
    setInterval(() => {
      if (this.hasIdledTooLong && this.isStopped && !this.isDisconnecting) {
        this.isDisconnecting = true;
        const asset = this.getSoundAsset("disconnect.ogg");
        const disconnect = () => {
          if (this.connection != null) {
            console.log("Disconnecting from voice channel due to inactivity.");
            console.log(this.connection);
            try {
              this.connection.destroy();
              this.connection = null;
            } catch (error) {
              console.error("Error disconnecting from voice channel:", error);
            }
          }
          this.isDisconnecting = false;
        };

        if (asset) {
          this.playSoundFileDirect(asset)
            .catch(() => {
              // Fallback to direct disconnect if the sound fails to play.
            })
            .finally(disconnect);
        } else {
          disconnect();
        }
      }
    }, 1000);
  }

  _playNextInQueue() {
    if (this.soundQueue.length > 0) {
      const nextSound = this.soundQueue.shift()!;
      this.audioInstance.play(nextSound);
    } else {
      this.audioInstance.stop();
    }
  }

  _handleEvents() {
    this.audioInstance.on("error", (err) => {
      console.error("Player error:", err.message);
    });

    this.audioInstance.on(AudioPlayerStatus.Playing, () => {
      this.idleTimer = Date.now();
    });

    this.audioInstance.on(AudioPlayerStatus.Idle, () => {
      this.idleTimer = Date.now();
      this._playNextInQueue();
    });
  }

  _addToQueue(sound: AudioResource) {
    this.soundQueue.push(sound);
    if (!this.isPlaying) {
      this._playNextInQueue();
    }
  }

  get isPlaying(): boolean {
    return this.audioInstance.state.status === AudioPlayerStatus.Playing;
  }

  get isPaused(): boolean {
    return this.audioInstance.state.status === AudioPlayerStatus.Paused;
  }

  get isStopped(): boolean {
    return this.audioInstance.state.status === AudioPlayerStatus.Idle;
  }

  get hasIdledTooLong(): boolean {
    return Date.now() - this.idleTimer > this.idleTimeout * 1000;
  }

  getSoundAsset(name: string): string | null {
    try {
      const soundsDir = getDirectoryRoot();
      const soundAsset = path.resolve(soundsDir, "assets", "sounds", name);
      if (!fs.existsSync(soundAsset)) {
        throw new Error(`Sound asset not found: ${name}`);
      }
      return soundAsset;
    } catch (error) {
      console.error("Error getting sound asset:", error);
      return null;
    }
  }

  playSoundFile(sound: string | Readable) {
    const soundResource = createAudioResource(sound);
    this._addToQueue(soundResource);
  }

  async playSoundFileDirect(sound: string): Promise<void> {
    const soundResource = createAudioResource(sound);
    this.audioInstance.play(soundResource);
    return new Promise((resolve, reject) => {
      try {
        setTimeout(() => resolve(), 7000);
      } catch (error) {
        reject(error);
      }
    });
  }

  setIdleTimeoutDuration(duration: number) {
    // Accept either seconds (normal path) or legacy milliseconds values.
    this.idleTimeout = duration;
  }

  forceStop() {
    this.soundQueue = [];
    this.audioInstance.stop();
  }
}
