import { SlashCommandBuilder } from "discord.js";
import type { BotCommand } from "../types.ts";
import { saveGuildTTSSettings } from "../../supabase/models/guilds.ts";

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("tts-say-user-toggle")
    .setDescription(
      "Toggles whether the TTS message includes the user's name.",
    ),
  requirements: {
    userPermissions: ["Administrator"],
  },
  async execute(interaction, client, extendedGuild) {
    await interaction.deferReply();
    const nextValue = !extendedGuild.settings.tts.ttsSayUsersName;
    extendedGuild.settings.tts.ttsSayUsersName = nextValue;
    await saveGuildTTSSettings(extendedGuild.id, extendedGuild.settings.tts);

    await interaction.editReply(
      `TTS messages will now ${nextValue ? "include" : "not include"} the user's name for this guild. `,
    );
  },
};

export default command;
