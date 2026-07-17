import {
  Channel,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";
import ClientInstance from "../modules/ClientInstance.ts";
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
    .setName("tts-swap-channel")
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

      const voiceInstance = ClientInstance.activeVoiceConnections.get(
        interaction.guildId,
      );

      invariant(voiceInstance, "Lerche is sleeping, no voice instance found.");

      await voiceInstance.destroy({
        destroyConnection: true,
        playDisconnectSound: false,
      });
      voiceInstance.currentChannel = voiceChannel;
      voiceInstance.setVoiceConnection();

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
