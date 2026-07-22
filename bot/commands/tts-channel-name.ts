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
  async execute(interaction, client) {
    await interaction.deferReply({});
    const guild = client.installedGuilds.find(
      (g) => g.id === interaction.guildId,
    );
    if (!guild) {
      await interaction.editReply("This command can only be used in a guild.");
      return;
    }
    const channelName = interaction.options.getString("channel-name", true);
    const extendedGuild = guild as any;
    extendedGuild.settings.tts.ttsChannelName = channelName;
    await saveGuildTTSSettings(guild.id, extendedGuild.settings.tts);
    await interaction.editReply(`TTS channel name set to: ${channelName}`);
  },
};

export default command;
