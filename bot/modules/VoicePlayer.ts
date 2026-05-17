import {
  AudioPlayer,
  AudioPlayerStatus,
  AudioResource,
  VoiceConnection,
  createAudioPlayer,
  createAudioResource,
} from "@discordjs/voice";
import { Readable } from "stream";
import getDirectoryRoot from "../helpers/getDirectoryRoot.js";
import path from "path";
import fs from "fs";

class VoicePlayerClass {
  timeOfCreation: number;
  idleTimeout: number;
  idleTimer: number;
  connection: VoiceConnection | null;
  audioInstance: AudioPlayer;
  soundQueue: AudioResource[];

  constructor() {
    this.timeOfCreation = Date.now();
    this.idleTimeout = 300000; // 5 minutes
    this.idleTimer = this.timeOfCreation;
    this.connection = null;
    this.soundQueue = [];
    this.audioInstance = createAudioPlayer();

    this._monitorIdleState();
    this._handleEvents();
  }

  _setConnection(connection: VoiceConnection){
    this.connection = connection;
  }

  _monitorIdleState(){
    setInterval(() => {
      if (this.hasIdledTooLong && this.isStopped) {
        const asset = this.getSoundAsset("disconnect.ogg");
        if (asset) {
          this.playSoundFileDirect(asset).then(() => {
            if (this.connection != null) {
              this.connection.destroy();
              this.connection = null;
            }
          });
        }
      }
    }, 1000);
  }

  _playNextInQueue(){
    if (this.soundQueue.length > 0) {
      const nextSound = this.soundQueue.shift()!;
      this.audioInstance.play(nextSound);
    } else {
      this.audioInstance.stop();
      console.log("Sound queue is empty.");
    }
  }

  _handleEvents(){
    this.audioInstance.on("error", (err) => {
      console.error("Player error:", err.message);
    });

    this.audioInstance.on(AudioPlayerStatus.Playing, () => {
      console.log("Audio player is now playing.");
      this.idleTimer = Date.now();
    });

    this.audioInstance.on(AudioPlayerStatus.Idle, () => {
      console.log("Audio player is now idle.");
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
    return Date.now() - this.idleTimer > this.idleTimeout;
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
}

// Export a singleton instance
const VoicePlayer = new VoicePlayerClass();
export default VoicePlayer;
