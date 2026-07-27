import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import ClientInstance from "../modules/ClientInstance.ts";
import invariant from "tiny-invariant";
import { BotCommand } from "../types.ts";
import { allowedToJoinChannel } from "../helpers/allowedMessage.ts";

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

      if (!voiceInstance) {
        await interaction.reply(
          "Lerche is not currently in a voice channel. Type in her TTS chanenel to make her join your channel first.",
        );
        return;
      }

      const allowedResults = await allowedToJoinChannel(
        ClientInstance,
        interaction.guild,
        voiceChannel,
      );

      if (!allowedResults) {
        await interaction.reply(
          `Lerche does not have the required permissions to join, view or speak in ${voiceChannel.name}.`,
        );
        return;
      }

      await voiceInstance.destroy({
        destroyConnection: true,
        playDisconnectSound: false,
      });
      voiceInstance.currentChannel = voiceChannel;
      voiceInstance.setVoiceConnection();

      await interaction.reply(`Moved to ${voiceChannel.name}.`);
    } catch (error) {
      console.error("Error executing swap-channel command:", error);
      if (error instanceof Error) {
        await interaction.reply(
          error.message || "An error occurred while trying to swap channels.",
        );
      } else {
        await interaction.reply(
          "An unknown error occurred while trying to swap channels.",
        );
      }
    }
  },
};

export default command;
