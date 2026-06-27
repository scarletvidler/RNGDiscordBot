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
import { getCleanName } from "../helpers/getClean.ts";
import invariant from "tiny-invariant";
import { channelWithPlayer } from "../types.ts";
import isRosie from "../helpers/isRosie.ts";
import ElevenLabs from "./ElevenLabs.ts";

export async function joinAndPlay(
  channel: VoiceBasedChannel,
  message: Message<boolean>,
): Promise<{ messagePlayed: string }> {
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
    currentChannel.player.setIdleTimeoutDuration(timeOutDuration || 600);

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

    const { audio, playedMessage } = await convertMessageToSpeech(message);
    player.playSoundFile(audio);
    return { messagePlayed: playedMessage };
  } catch (error) {
    console.error("Error in joinAndPlay:", error);
    throw error;
  }
}

function validateMessageContent(message: Message<boolean>): string {
  try {
    let content = message.content.trim();
    const roomPrefixEnabled =
      clientInstance.installedGuilds.find((g) => g.id === message.guildId)
        ?.settings.tts.roomPrefixEnabled ?? false;

    if (roomPrefixEnabled) {
      content = content.replace(/^\/t(?:\s+|$)/i, "").trim();
    }

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
): Promise<{ audio: Readable; playedMessage: string }> {
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

  if (isRosie(member as any)) {
    voiceId = "kdmDKE6EkgrWrrykO9Qt";
  }

  if (!voiceId) {
    throw new Error("No voiceId configured for this guild.");
  }

  const text = validateMessageContent(message);
  const elevenlabs = ElevenLabs.getInstance();

  try {
    const audioStream = await elevenlabs.convertTextToSpeech(voiceId, text);
    const content = await streamToBuffer(audioStream);

    // convert the buffer to a Readable stream
    const audio = Readable.from(content);
    return { audio, playedMessage: text };
  } catch (error) {
    console.error("❌ Error converting text to speech:", error);
    throw error;
  }
}

async function streamToBuffer(
  stream: ReadableStream<Uint8Array> | AsyncIterable<Uint8Array>,
): Promise<Buffer> {
  const chunks: Buffer[] = [];

  if (Symbol.asyncIterator in stream) {
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks);
}
