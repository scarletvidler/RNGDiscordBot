import type { BotCommand, channelWithPlayer } from "../types.ts";
import type { ExtendedClient } from "../types.ts";
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
    extendedGuild,
  ): Promise<void> {
    await interaction.deferReply({
      flags: MessageFlags.Ephemeral,
    });
    if (!interaction.inCachedGuild()) {
      await interaction.editReply(
        "Well, that shouldn't happen. Lerche doesn't think your server exists. Please reinstall her. If this error contuines, please reach out on the support server: https://discord.gg/EvRpWuj7We",
      );
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
