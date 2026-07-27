import { MessageFlags, SlashCommandBuilder } from "discord.js";
import { BotCommand } from "../types.ts";
import { saveGuildTTSSettings } from "../../supabase/models/guilds.ts";

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("tts-channel-name")
    .setDescription("Sets the TTS channel name for this guild.")
    .addStringOption((option) =>
      option
        .setName("channel-name")
        .setDescription("The name of the voice channel to use for TTS.")
        .setRequired(true),
    ),
  requirements: {
    userPermissions: ["Administrator"],
  },
  async execute(interaction, client, extendedGuild) {
    await interaction.deferReply({});
    const channelName = interaction.options.getString("channel-name", true);
    extendedGuild.settings.tts.ttsChannelName = channelName;
    await saveGuildTTSSettings(extendedGuild.id, extendedGuild.settings.tts);
    await interaction.editReply(`TTS channel name set to: ${channelName}`);
  },
};

export default command;
