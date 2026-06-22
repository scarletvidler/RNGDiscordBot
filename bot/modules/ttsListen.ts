import "dotenv/config";
import {
  joinVoiceChannel,
  VoiceConnectionStatus,
  entersState,
  getVoiceConnection,
  VoiceConnection,
} from "@discordjs/voice";
import { Channel, type Message, type VoiceBasedChannel } from "discord.js";
import { Readable } from "stream";
import VoicePlayerClass from "./VoicePlayer.ts";
import clientInstance from "./client.ts";
import getCleanName from "../helpers/getCleanName.ts";
import invariant from "tiny-invariant";
import { channelWithPlayer } from "../types.ts";
import { ElevenLabsClient, play } from "@elevenlabs/elevenlabs-js";
import { createWriteStream, createReadStream } from "fs";
import fs from "node:fs";

export async function joinAndPlay(
  channel: VoiceBasedChannel,
  message: Message<boolean>,
): Promise<boolean> {
  try {
    let voiceConn: VoiceConnection | undefined = getVoiceConnection(
      channel.guild.id,
    );

    /*  TODO: 
     - Refactor this to use a better state management system for
     - voice connections and players, rather than relying on the channel's player property
     - and fetching the channel every time. This is a band-aid to avoid multiple connections
     - being created when multiple messages are sent in quick succession before the first connection is fully established.
     - get the channel from the cache to avoid creating multiple connections to the same guild
     */

    const currentChannel: channelWithPlayer | false =
      (await clientInstance.channels.fetch(channel.id).catch((err) => {
        console.error(`Error fetching channel ${channel.id}:`, err);
      })) || false;

    invariant(currentChannel, "Channel not found in cache");

    const timeOutDuration = clientInstance.installedGuilds.find(
      (g) => g.id === channel.guild.id,
    )?.settings.tts.idleTimeout;
    currentChannel.player =
      currentChannel.player ||
      new VoicePlayerClass({
        idleTimeout: timeOutDuration,
      });

    // reset the idle timer whenever a new message is sent
    currentChannel.player.idleTimeoutDuration = timeOutDuration || 60;

    if (!voiceConn) {
      const newConn = joinVoiceChannel({
        channelId: channel.id,
        guildId: channel.guild.id,
        adapterCreator: channel.guild.voiceAdapterCreator,
        selfDeaf: true,
      });

      newConn.on("stateChange", (oldState, newState) => {
        // console.debug(`[voice] ${oldState.status} -> ${newState.status}`);
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

function validateMessageContent(message: Message<boolean>): string {
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
      return `A link to $${url.hostname} was sent by ${getCleanName(
        message.author,
      )}`;
    });

    return content;
  } catch (error) {
    const err = error as Error;
    console.error("Error processing message content:", err);
    return `Sorry, I couldn't process that message. Here is why: ${err.message}`;
  }
}

async function convertMessageToSpeech(
  message: Message<boolean>,
): Promise<Readable> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("❌ ELEVENLABS_API_KEY missing from .env");

  let voiceId = clientInstance.installedGuilds.find(
    (g) => g.id === message.guildId,
  )?.settings.tts.femaleVoiceId;
  // if the user has a role called "male" change to using the male voice (Adam - 21mL7)
  const member = message.member;
  if (member) {
    const hasMaleRole = member.roles.cache.some(
      (role) => role.name.toLowerCase() === "male",
    );
    if (hasMaleRole) {
      voiceId = clientInstance.installedGuilds.find(
        (g) => g.id === message.guildId,
      )?.settings.tts.maleVoiceId as string;
    }
  }

  const text = validateMessageContent(message);
  console.log(`User: ${getCleanName(message.author)}`, `Message: ${text}`);

  console.log(
    `Using voice ID: ${voiceId} for user: ${getCleanName(message.author)}`,
  );

  const elevenlabs = new ElevenLabsClient({
    apiKey,
  });

  const pronunciationDictionary =
    await elevenlabs.pronunciationDictionaries.createFromFile({
      file: fs.createReadStream("bot/pronunciation/dictionary.pls"),
      name: "default",
    });

  try {
    const audioStream = await elevenlabs.textToSpeech.convert(voiceId, {
      text,
      modelId: "eleven_v3",
      outputFormat: "mp3_44100_128",
      pronunciationDictionaryLocators: [
        {
          pronunciationDictionaryId: pronunciationDictionary.id,
          versionId: pronunciationDictionary.versionId,
        },
      ],
    });

    const chunks: Buffer[] = [];
    for await (const chunk of audioStream) {
      chunks.push(Buffer.from(chunk));
    }
    const content = Buffer.concat(chunks);

    // convert the buffer to a Readable stream
    const audio = Readable.from(content);
    return audio;
  } catch (error) {
    console.error("❌ Error converting text to speech:", error);
    throw error;
  }
}
