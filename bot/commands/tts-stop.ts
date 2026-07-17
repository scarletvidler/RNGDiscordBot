import type { BotCommand, channelWithPlayer } from "../types.ts";
import { ExtendedClient } from "../types";
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
  async execute(
    interaction: ChatInputCommandInteraction,
    client: ExtendedClient,
  ): Promise<void> {
    await interaction.deferReply({
      flags: MessageFlags.Ephemeral,
    });
    if (!interaction.inCachedGuild()) {
      await interaction.editReply("This command can only be used in a guild.");
      return;
    }

    let voiceInstance = client.activeVoiceConnections.get(interaction.guildId!);

    if (!voiceInstance) {
      await interaction.editReply(
        "No active TTS playback found in this guild.",
      );
      return;
    }

    voiceInstance.destroy({
      destroyConnection: true,
      playDisconnectSound: false,
    });

    await interaction.editReply("TTS playback stopped and queue cleared.");
  },
};

export default command;
