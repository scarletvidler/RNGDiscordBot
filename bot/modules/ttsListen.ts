import "dotenv/config";
import {
  joinVoiceChannel,
  VoiceConnectionStatus,
  entersState,
  getVoiceConnection,
  VoiceConnection,
} from "@discordjs/voice";
import { Channel, type Message, type VoiceBasedChannel } from "discord.js";
import VoicePlayer from "./VoicePlayer.ts";
import ClientInstance from "./ClientInstance.ts";
import invariant from "tiny-invariant";
import { channelWithPlayer } from "../types.ts";
import { DBGuildWithSettings } from "../../supabase/models/guilds.ts";
import convertMessageToSpeech from "./tts/convertToSpeech.ts";

export async function joinAndPlay(
  channel: VoiceBasedChannel,
  message: Message<boolean>,
  guild: DBGuildWithSettings,
): Promise<{ messagePlayed: string; tokensUsed: number }> {
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

    let currentChannel: channelWithPlayer | Channel | false =
      (await ClientInstance.channels.fetch(channel.id).catch((err) => {
        console.error(`Error fetching channel ${channel.id}:`, err);
      })) || false;
    invariant(currentChannel, "Channel not found in cache");
    invariant(guild, "Guild not found in installedGuilds");

    const { idleTimeout } = guild.settings.tts;

    currentChannel.player =
      currentChannel.player ||
      new VoicePlayer({
        idleTimeout: idleTimeout,
      });

    // reset the idle timer whenever a new message is sent
    currentChannel.player.setIdleTimeoutDuration(idleTimeout || 600);

    if (!voiceConn) {
      const newConn = joinVoiceChannel({
        channelId: channel.id,
        guildId: channel.guild.id,
        adapterCreator: channel.guild.voiceAdapterCreator,
        selfDeaf: true,
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

    const { audio, playedMessage, tokensUsed } =
      await convertMessageToSpeech(message);
    console.log(
      `Audio stream received from ElevenLabs with ${tokensUsed} tokens used.`,
    );
    player.playSoundFile(audio);
    return { messagePlayed: playedMessage, tokensUsed };
  } catch (error) {
    console.error("Error in joinAndPlay:", error);
    throw error;
  }
}
