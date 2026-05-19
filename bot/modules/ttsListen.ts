import "dotenv/config";
import {
  joinVoiceChannel,
  VoiceConnectionStatus,
  entersState,
  getVoiceConnection,
  VoiceConnection,
} from "@discordjs/voice";
import { type Message, type User, type VoiceBasedChannel } from "discord.js";
import { Readable } from "stream";
import VoicePlayerClass from "./VoicePlayer.ts";
import clientInstance from "./client.ts";


export async function joinAndPlay(
  channel: VoiceBasedChannel,
  message: Message<true>,
): Promise<boolean> {
  try {
    let voiceConn: VoiceConnection | undefined = getVoiceConnection(
      channel.guild.id,
    );
    
    // TODO: Refactor this to use a better state management system for voice connections and players, rather than relying on the channel's player property and fetching the channel every time. This is a band-aid to avoid multiple connections being created when multiple messages are sent in quick succession before the first connection is fully established.
    // get the channel from the cache to avoid creating multiple connections to the same guild
    const currentChannel = await clientInstance.channels.fetch(channel.id).catch((err) => {
      console.error(`Error fetching channel ${channel.id}:`, err);
    });

    currentChannel.player = currentChannel.player || new VoicePlayerClass();

    if (!voiceConn) {
      const newConn = joinVoiceChannel({
        channelId: channel.id,
        guildId: channel.guild.id,
        adapterCreator: channel.guild.voiceAdapterCreator,
        selfDeaf: true,
      });

      newConn.on("stateChange", (oldState, newState) => {
        console.debug(`[voice] ${oldState.status} -> ${newState.status}`);
      });

      // Only attach disconnect handler AFTER we've reached Ready
      newConn.once(VoiceConnectionStatus.Ready, () => {
        newConn.on(VoiceConnectionStatus.Disconnected, async () => {
          try {
            await Promise.race([
              entersState(newConn, VoiceConnectionStatus.Signalling, 5_000),
              entersState(newConn, VoiceConnectionStatus.Connecting, 5_000),
            ]);
          } catch {
            newConn.destroy();
          }
        });
      });

      voiceConn = newConn;
    }

    const connection = voiceConn;

    // Wait until fully connected
    await entersState(connection, VoiceConnectionStatus.Ready, 30_000);

    const player = currentChannel.player;
    player._setConnection(connection);
    connection.subscribe(player.audioInstance);

    if (player.soundQueue.length === 0 && !player.isPlaying) {
      const pingAsset = player.getSoundAsset("ping.ogg");
      if (pingAsset) player.playSoundFile(pingAsset);
    }

    const resourceStream = await convertMessageToSpeech(message);
    player.playSoundFile(resourceStream);
    return true;
  } catch (error) {
    console.error("Error in joinAndPlay:", error);
    throw error;
  }
}

function getCleanName(user: User): string {
  return user.globalName && /^[\x00-\x7F]+$/.test(user.globalName)
    ? user.globalName
    : user.username;
}

function validateMessageContent(message: Message<true>): string {
  try {
    let content = message.content.trim();
    content = content.replace(/\n/g, " ");

    message.mentions.users.forEach((user) => {
      console.log(user.globalName?.match(/^[\x00-\x7F]+$/));
      const name = getCleanName(user);
      content = content.replace(`<@${user.id}>`, name);
    });

    const urlRegex = /(https?:\/\/[^\s]+)/g;
    content = content.replace(urlRegex, (match) => {
      const url = new URL(match);
      return `A link to $${url.hostname} was sent by ${getCleanName(message.author)}`;
    });

    return content;
  } catch (error) {
    const err = error as Error;
    console.error("Error processing message content:", err);
    return `Sorry, I couldn't process that message. Here is why: ${err.message}`;
  }
}

async function convertMessageToSpeech(message: Message<true>): Promise<Readable> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("❌ ELEVENLABS_API_KEY missing from .env");

  let voiceId = "cgSgspJ2msm6clMCkdW9"; // Lerche (Jessica)
  const maleVoiceId = "21mL7"; // Adam

  // if the user has a role called "male" change to using the male voice (Adam - 21mL7)
  const member = message.member;
  if (member) {
    const hasMaleRole = member.roles.cache.some(
      (role) => role.name.toLowerCase() === "male",
    );
    if (hasMaleRole) {
      voiceId = maleVoiceId;
    }
  }

  console.log("Generating speech...");

  const text = validateMessageContent(message);
  console.log("Final message to speak:", text);

  console.log("Downloading speech from ElevenLabs...");
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_v3",
        voice_settings: {
          speed: 1.5,
        },
      }),
    },
  );

  console.log("ElevenLabs response status:", response.status);


  if (response.status !== 200) {
    const errorText = await response.text();
    throw new Error(`❌ ElevenLabs TTS error: ${response.status} ${errorText}`);
  }

  const body = response.body;
  if (!body) throw new Error("❌ ElevenLabs returned no body");

  // Convert Web ReadableStream → Node Readable for @discordjs/voice compatibility
  return Readable.fromWeb(body as Parameters<typeof Readable.fromWeb>[0]);
}
