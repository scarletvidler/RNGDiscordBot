import type { BotCommand, channelWithPlayer } from "../types.ts";
import {
  ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("tts-stop")
    .setDescription(
      "Stops the TTS playback and clears the queue. (used for when she gets stuck)",
    ),
  requirements: {
    userPermissions: ["Administrator"],
  },
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply({
      flags: MessageFlags.Ephemeral,
    });
    if (!interaction.inCachedGuild()) {
      await interaction.editReply("This command can only be used in a guild.");
      return;
    }

    const channel = interaction.member?.voice.channel as
      | channelWithPlayer
      | null;
    if (!channel) {
      await interaction.editReply(
        "You need to be in a voice channel to use this command.",
      );
      return;
    }
    // get the player for the current guild        const player = channel.player;
    if (!channel.player) {
      await interaction.editReply(
        "I'm not currently playing anything in your voice channel.",
      );
      return;
    }

    channel.player.forceStop();
    await interaction.editReply("TTS playback stopped and queue cleared.");
  },
};

export default command;
