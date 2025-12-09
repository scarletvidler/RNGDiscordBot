// AudioPlayerBufferingState
// AudioPlayerIdleState
// AudioPlayerPausedState
// AudioPlayerPlayingState

import {
  AudioPlayerStatus,
  createAudioPlayer,
  createAudioResource,
} from "@discordjs/voice";
import getDirectoryRoot from "../helpers/getDirectoryRoot.js";
import path from "path";
import fs from "fs";

class VoicePlayerClass {
  static _instance;
  constructor() {
    this.timeOfCreation = Date.now();
    this.idleTimeout = 300000; // 5 minutes
    this.idleTimer = this.timeOfCreation;
    this.connection = null;
    this.audioInstance = null;
    this.idleInterval = null;
    this.soundQueue = [];

    this._monitorIdleState();
    this._createPlayer();
    this._handleEvents();
  }

  _setConnection(connection) {
    this.connection = connection;
  }

  _monitorIdleState() {
    setInterval(() => {
      if (this.hasIdledTooLong && this.isStopped) {
        this.playSoundFileDirect(this.getSoundAsset("disconnect.ogg")).then(
          () => {
            if (this.connection != null) {
              this.connection.destroy();
              this.connection = null;
            }
          }
        );
      }
    }, 1000); // Check every 1 second
  }

  _createPlayer() {
    this.audioInstance = createAudioPlayer();
  }

  _playNextInQueue() {
    if (this.soundQueue.length > 0) {
      const nextSound = this.soundQueue.shift();
      this.audioInstance.play(nextSound);
    } else {
      this.audioInstance.stop();
      console.log("Sound queue is empty.");
    }
  }

  _handleEvents() {
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

  _addToQueue(sound) {
    this.soundQueue.push(sound);
    if (!this.isPlaying) {
      this._playNextInQueue();
    }
  }

  get isPlaying() {
    return this.audioInstance.state.status === AudioPlayerStatus.Playing;
  }

  get isPaused() {
    return this.audioInstance.state.status === AudioPlayerStatus.Paused;
  }

  get isStopped() {
    return this.audioInstance.state.status === AudioPlayerStatus.Idle;
  }

  get hasIdledTooLong() {
    return Date.now() - this.idleTimer > this.idleTimeout;
  }

  getSoundAsset(name) {
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

  playSoundFile(sound) {
    const soundResource = createAudioResource(sound);
    this._addToQueue(soundResource);
  }

  // Bypass the queue and play immediately
  async playSoundFileDirect(sound) {
    const soundResource = createAudioResource(sound);
    this.audioInstance.play(soundResource);
    // return a promise that resolves after soundResource.playbackDuration;
    return new Promise((resolve, reject) => {
      try {
        setTimeout(() => {
          resolve();
        }, 4000);
      } catch (error) {
        reject(error);
      }
    });
  }
}

// Export a singleton instance
const VoicePlayer = new VoicePlayerClass();
export default VoicePlayer;
