import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import type { BotCommand } from "../types.ts";
import { DBUpsertGuildTTSSettings } from "../../supabase/models/guilds.ts";

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("config-leave-message")
    .setDescription(
      "Choose whether Lerche speaks before leaving the voice channel.",
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addBooleanOption((option) =>
      option
        .setName("enabled")
        .setDescription(
          "Enable the spoken leave message, or disable it to leave silently.",
        )
        .setRequired(true),
    ),
  requirements: {
    userPermissions: ["Administrator"],
  },
  async execute(interaction, client, extendedGuild) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const enabled = interaction.options.getBoolean("enabled", true);
    await DBUpsertGuildTTSSettings({
      guild_id: extendedGuild.id,
      leave_message_enabled: enabled,
    });
    // Update cached settings only after the save succeeds.
    extendedGuild.settings.tts.leave_message_enabled = enabled;
    const activeVoice = client.activeVoiceConnections.get(extendedGuild.id);
    if (activeVoice) {
      activeVoice.DBGuild.settings.tts.leave_message_enabled = enabled;
    }
    await interaction.editReply(
      enabled
        ? "Lerche will play her leave message before leaving the voice channel."
        : "Lerche will leave the voice channel silently.",
    );
  },
};

export default command;
