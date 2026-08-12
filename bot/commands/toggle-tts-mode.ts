import { SlashCommandBuilder } from "discord.js";
import type { BotCommand } from "../types.ts";
import { toggleGuildRoomPrefixMode } from "../../supabase/models/guilds.ts";

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("toggle-tts-mode")
    .setDescription(
      "Toggles /t room mode instead of using the configured TTS channel.",
    ),
  requirements: {
    userPermissions: ["Administrator"],
  },
  async execute(interaction, client, extendedGuild) {
    await interaction.deferReply();

    const nextValue = await toggleGuildRoomPrefixMode(extendedGuild);

    await interaction.editReply(
      nextValue
        ? "TTS room mode is enabled. Lerche will read messages from your current voice room when they start with `/t`."
        : `TTS room mode is disabled. Lerche will use #${extendedGuild.settings.tts.tts_channel_name}.`,
    );
  },
};

export default command;
