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

    this.audioInstance = null;
    this.connection = null;
    this.soundQueue = [];

    this._createPlayer();
    this._handleEvents();
  }
  _createPlayer() {
    this.audioInstance = createAudioPlayer();
  }

  _playNextInQueue() {
    if (this.soundQueue.length > 0) {
      const nextSound = this.soundQueue.shift();
      this.audioInstance.play(nextSound);
    } else {
      console.log("Sound queue is empty.");
    }
  }

  _handleEvents() {
    this.audioInstance.on("stateChange", (oldState, newState) => {
      console.log(`Player: ${oldState.status} -> ${newState.status}`);
    });
    this.audioInstance.on("error", (err) => {
      console.error("Player error:", err.message);
    });

    this.audioInstance.on(AudioPlayerStatus.Idle, () => {
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
}

// Export the singleton instance
const VoicePlayer = new VoicePlayerClass();
export default VoicePlayer;
