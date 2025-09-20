import "dotenv/config";
import fs from "fs";
import { PassThrough } from "stream";
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  VoiceConnectionStatus,
  entersState,
} from "@discordjs/voice";
import elevenlabsJs from "elevenlabs-js";

/**
 * Join a voice channel and speak a message.
 */
export async function joinAndPlay(channel, message) {
  // Connect to the channel
  const connection = joinVoiceChannel({
    channelId: channel.id,
    guildId: channel.guild.id,
    adapterCreator: channel.guild.voiceAdapterCreator,
  });

  // Wait until fully connected
  await entersState(connection, VoiceConnectionStatus.Ready, 30_000);

  // Create a player
  const player = createAudioPlayer();

  // Generate speech stream from ElevenLabs
  const resourceStream = await convertMessageToSpeech(
    "Hello world, I am alive!"
  );

  // Wrap it for Discord
  const resource = createAudioResource(resourceStream);

  player.play(resource);
  connection.subscribe(player);
}

/**
 * Generate TTS audio as a stream (no file saving).
 */
async function convertMessageToSpeech(message) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("❌ ELEVENLABS_API_KEY missing from .env");

  elevenlabsJs.setApiKey(apiKey);

  const res = await elevenlabsJs.textToSpeech(
    "bl0TUn2b06BCzwDpiLlg", // voice id
    message,
    "eleven_multilingual_v2"
  );

  // Create a duplex stream
  const pass = new PassThrough();

  // Feed ElevenLabs audio into it
  const pipe = await res.pipe;
  pipe(pass);

  // Now `pass` is a proper Readable stream you can return
  return pass;
}
