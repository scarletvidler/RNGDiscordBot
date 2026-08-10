import { SlashCommandBuilder } from "discord.js";
import type { BotCommand } from "../types.ts";
import { DBUpsertGuildTTSSettings } from "../../supabase/models/guilds.ts";

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("tts-jingle-toggle")
    .setDescription(
      "Toggles the jingle that plays before the first TTS message.",
    ),
  requirements: {
    userPermissions: ["Administrator"],
  },
  async execute(interaction, client, extendedGuild) {
    await interaction.deferReply();
    const nextValue = !extendedGuild.settings.tts.tts_ping_sound_enabled;
    extendedGuild.settings.tts.tts_ping_sound_enabled = nextValue;
    await DBUpsertGuildTTSSettings(extendedGuild.settings.tts);

    await interaction.editReply(
      `The TTS jingle has been ${nextValue ? "enabled" : "disabled"} for this guild.`,
    );
  },
};

export default command;
