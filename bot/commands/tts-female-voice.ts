import { SlashCommandBuilder } from "discord.js";
import { BotCommand } from "../types.ts";
import ElevenLabs from "../modules/ElevenLabs.ts";
import { saveGuildTTSSettings } from "../../supabase/models/guilds.ts";

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("tts-female-voice")
    .setDescription("Sets the female TTS voice ID for this guild.")
    .addStringOption((option) =>
      option
        .setName("voice-id")
        .setDescription("The ElevenLabs voice ID to use for female voices.")
        .setRequired(true),
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
    // const voiceId = interaction.options.getString("voice-id", true);
    // const extendedGuild = guild as any;

    // await ElevenLabs.getInstance()
    //   .getVoiceName(voiceId)
    //   .catch(async (error) => {
    //     console.error("Error fetching voice name:", error);
    //     await interaction.editReply(
    //       `Failed to fetch voice name for ID: ${voiceId}. Please ensure the voice ID is valid.`,
    //     );
    //     throw new Error(`Failed to fetch voice name for ID: ${voiceId}`);
    //   });

    // extendedGuild.settings.tts.femaleVoiceId = voiceId;
    // await saveGuildTTSSettings(guild.id, extendedGuild.settings.tts);
    // await interaction.editReply(`Female voice ID set to: ${voiceId}`);
    await interaction.editReply(
      "This command is currently disabled. Sorry! I'll be re-enabling it soon.",
    );
  },
};

export default command;
