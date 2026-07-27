import { SlashCommandBuilder } from "discord.js";
import type { BotCommand } from "../types.ts";
import { toggleGuildRoomPrefixMode } from "../../supabase/models/guilds.ts";

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("tts-room-prefix-toggle")
    .setDescription(
      "Toggles /t room mode instead of using the configured TTS channel.",
    ),
  requirements: {
    userPermissions: ["Administrator"],
  },
  async execute(interaction, client, extendedGuild) {
    await interaction.deferReply();

    const nextValue = await toggleGuildRoomPrefixMode(
      extendedGuild.id,
      extendedGuild.settings.tts,
    );
    extendedGuild.settings.tts.roomPrefixEnabled = nextValue;

    await interaction.editReply(
      nextValue
        ? "TTS room mode is enabled. Lerche will read messages from your current voice room when they start with `/t`."
        : `TTS room mode is disabled. Lerche will use #${extendedGuild.settings.tts.ttsChannelName}.`,
    );
  },
};

export default command;
