import {
  ChannelType,
  SlashCommandBuilder,
  type TextChannel,
} from "discord.js";
import { BotCommand } from "../types.ts";
import {
  DBUpsertGuildTTSSettings,
  syncGuildTTSSettingsWithDB,
} from "../../supabase/models/guilds.ts";
import {
  canLerchePerformAction,
  PermissionName,
} from "../modules/permissions/index.ts";

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("config-channel-name")
    .setDescription("Sets the text channel Lerche uses for TTS.")
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("The text channel to use for TTS.")
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true),
    ),
  requirements: {
    userPermissions: ["Administrator"],
  },
  async execute(interaction, _client, extendedGuild) {
    await interaction.deferReply();
    const channel = interaction.options.getChannel(
      "channel",
      true,
    ) as TextChannel;
    const result = await canLerchePerformAction(
      interaction.guild!,
      [
        PermissionName.ViewChannel,
        PermissionName.SendMessages,
        PermissionName.ReadMessageHistory,
      ],
      channel,
    );
    if (!result.allowed) {
      await interaction.editReply(
        `Lerche cannot use <#${channel.id}> because she is missing: ${result.missingPermissions.join(", ")}.`,
      );
      return;
    }

    const settings = await DBUpsertGuildTTSSettings({
      guild_id: extendedGuild.id,
      tts_channel_id: channel.id,
      tts_channel_name: channel.name,
      room_prefix_enabled: false,
    });
    syncGuildTTSSettingsWithDB(settings, extendedGuild);
    await interaction.editReply(`TTS channel set to <#${channel.id}>.`);
  },
};

export default command;
