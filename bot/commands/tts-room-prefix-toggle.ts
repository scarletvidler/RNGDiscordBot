import { SlashCommandBuilder } from "discord.js";
import type { BotCommand } from "../types.ts";
import { toggleGuildRoomPrefixMode } from "../../supabase/modules/guild.ts";

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("tts-room-prefix-toggle")
    .setDescription(
      "Toggles /t room mode instead of using the configured TTS channel.",
    ),
  requirements: {
    userPermissions: ["Administrator"],
  },
  async execute(interaction, client) {
    await interaction.deferReply();

    const guild = client.installedGuilds.find(
      (g) => g.id === interaction.guildId,
    );

    if (!guild) {
      await interaction.editReply("This command can only be used in a guild.");
      return;
    }

    const nextValue = await toggleGuildRoomPrefixMode(
      guild.id,
      guild.settings.tts,
    );
    guild.settings.tts.roomPrefixEnabled = nextValue;

    await interaction.editReply(
      nextValue
        ? "TTS room mode is enabled. Lerche will read messages from your current voice room when they start with `/t`."
        : `TTS room mode is disabled. Lerche will use #${guild.settings.tts.ttsChannelName}.`,
    );
  },
};

export default command;
