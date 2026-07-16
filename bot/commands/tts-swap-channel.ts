import {
  Channel,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";
import clientInstance from "../modules/client.ts";
import invariant from "tiny-invariant";
import { BotCommand, channelWithPlayer } from "../types.ts";
import {
  entersState,
  joinVoiceChannel,
  VoiceConnectionStatus,
} from "@discordjs/voice";
import channelHasPlayer from "../helpers/channelHasPlayer.ts";

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("swap-channel")
    .setDescription(
      "Swaps the bot's current channel to be the user's current one.",
    ),
  requirements: {
    userPermissions: ["Administrator"],
  },
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    try {
      if (!interaction.inCachedGuild()) {
        await interaction.reply("This command can only be used in a server.");
        return;
      }
      const voiceChannel = interaction.member.voice.channel;

      if (!voiceChannel) {
        await interaction.reply(
          "You need to be in a voice channel to use this command.",
        );
        return;
      }

      invariant(interaction.guildId, "Command must be used in a server.");

      if (!channelHasPlayer(voiceChannel)) {
        const cachedChannel = clientInstance.channels.cache.find(
          (channel): channel is channelWithPlayer => {
            return channelHasPlayer(channel);
          },
        );

        invariant(cachedChannel, "No channel with a player found in cache.");
        const voiceChannelWithPlayer = {
          voiceChannel,
          player: cachedChannel.player,
        };

        if (cachedChannel.player) {
          voiceChannelWithPlayer.player = cachedChannel.player;
          voiceChannelWithPlayer.player._removeConnection();
          const newConn = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: interaction.guildId,
            adapterCreator: voiceChannel.guild.voiceAdapterCreator,
            selfDeaf: true,
          });
          await entersState(newConn, VoiceConnectionStatus.Ready, 30_000);
          voiceChannelWithPlayer.player._setConnection(newConn);
          newConn.subscribe(voiceChannelWithPlayer.player.audioInstance);
        }
      }

      await interaction.reply(`Moved to ${voiceChannel.name}.`);
    } catch (error) {
      console.error("Error executing swap-channel command:", error);
      await interaction.reply(
        "An error occurred while trying to swap channels. Please try again later.",
      );
    }
  },
};

export default command;
