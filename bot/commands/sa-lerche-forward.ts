import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { Readable } from "stream";
import type { BotCommand } from "../types.ts";
import ElevenLabs from "../modules/ElevenLabs.ts";
import { getErrorMessage } from "../helpers/errors.ts";

const SUPPORT_GUILD_ID = "1179157503766962176";

const command: BotCommand = {
  guildId: SUPPORT_GUILD_ID,
  data: new SlashCommandBuilder()
    .setName("lerche-forward")
    .setDescription(
      "Play a TTS message in a specific server if Lerche is connected.",
    )
    .addStringOption((option) =>
      option
        .setName("guild_id")
        .setDescription("The target server ID.")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("message")
        .setDescription("The message to forward.")
        .setRequired(true),
    ),
  requirements: {
    userPermissions: ["Administrator"],
  },
  async execute(interaction, client) {
    await interaction.deferReply({
      flags: MessageFlags.Ephemeral,
    });

    const guildId = interaction.options.getString("guild_id", true);
    const message = interaction.options.getString("message", true);

    if (message.trim().length === 0) {
      await interaction.editReply("[skipped] Message cannot be empty.");
      return;
    }

    if (message.length > 300) {
      await interaction.editReply(
        "[skipped] Message exceeds maximum length of 300 characters.",
      );
      return;
    }

    try {
      const guild = await client.guilds.fetch(guildId);
      const voiceInstance = client.activeVoiceConnections.get(guild.id);
      if (!voiceInstance) {
        await interaction.editReply(
          `[skipped] ${guild.name} (Lerche is not connected to a voice channel in this server.)`,
        );
        return;
      }

      const guildSettings = client.installedGuilds.find(
        (g) => g.id === guild.id,
      );
      const voiceId = guildSettings?.settings.tts.femaleVoiceId;
      if (!voiceId) {
        await interaction.editReply(
          `[skipped] ${guild.name} (No TTS voice configured for this server.)`,
        );
        return;
      }

      const elevenlabs = ElevenLabs.getInstance();
      const { data } = await elevenlabs.convertTextToSpeech(voiceId, message);
      const audio = Readable.fromWeb(data as any);
      voiceInstance.player.playSoundFile(audio);
      voiceInstance.resetIdleCountdown();

      await interaction.editReply(`[sent] ${guild.name}`);
    } catch (error) {
      await interaction.editReply(
        `[skipped] Could not play TTS in guild ${guildId} (${getErrorMessage(error)})`,
      );
    }
  },
};

export default command;
