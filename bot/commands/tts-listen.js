import "dotenv/config";
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  VoiceConnectionStatus,
  entersState,
} from "@discordjs/voice";
import { MessageActivityType } from "discord-api-types/v9";

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
  const resourceStream = await convertMessageToSpeech(message);

  // Wrap it for Discord
  const resource = createAudioResource(resourceStream);

  console.log("🗣️ Playing TTS message...");
  console.log(resource);

  player.play(resource);
  connection.subscribe(player);
}

function getCleanName(user) {
  return user.globalName && /^[\x00-\x7F]+$/.test(user.globalName)
    ? user.globalName
    : user.username;
}

function validateMessageContent(message) {
  try {
    message.content = message.content.trim(); // no leading/trailing spaces
    message.content = message.content.replace(/\n/g, " "); // no new lines

    // Find and replace mentions with the username
    if (message.mentions.users.size > 0)
      message.mentions.users.forEach((user) => {
        console.log(user.globalName.match(/^[\x00-\x7F]+$/));
        const name = getCleanName(user);
        console.log(user);
        message.content = message.content.replace(`<@${user.id}>`, name);
      });

    // Don't read out URLs and just read out the domain
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    message.content = message.content.replace(urlRegex, (match) => {
      const url = new URL(match);
      return `A link to $${url.hostname} was sent by ${getCleanName(
        message.author
      )}`;
    });
  } catch (error) {
    console.error("Error processing message content:", error);
    message.content = `Sorry, I couldn't process that message. Here is why: ${error.message}`;
  }
  return message.content;
}

/**
 * Generate TTS audio as a stream (no file saving).
 */
async function convertMessageToSpeech(message) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("❌ ELEVENLABS_API_KEY missing from .env");

  // const voice_id = "bl0TUn2b06BCzwDpiLlg";
  const voice_id = "cgSgspJ2msm6clMCkdW9";
  console.log("Generating speech...");

  message = validateMessageContent(message);

  console.log("Final message to speak:", message);

  // Stream speech (POST /v1/text-to-speech/:voice_id/stream)
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voice_id}/stream?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: message,
        model_id: "eleven_v3",
        voice_settings: {
          speed: 1.5,
        },
      }),
    }
  );
  console.log(response.body);
  const body = response.body;

  if (response.status !== 200) {
    const errorText = await response.text();
    throw new Error(`❌ ElevenLabs TTS error: ${response.status} ${errorText}`);
  }

  if (!body) throw new Error("❌ ElevenLabs returned no body");

  // Now `pass` is a proper Readable stream you can return
  return body;
}
