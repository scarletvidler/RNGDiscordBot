import { BotCommand } from "../types.ts";
import { SlashCommandBuilder } from "@discordjs/builders";
import { installer } from "../modules/installer.ts";

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("tts-install")
    .setDescription("Runs the TTS installation process for this guild."),
  requirements: {
    userPermissions: ["Administrator"],
  },

  async execute(interaction, client, extendedGuild) {
    await installer(client, interaction, interaction.guild!, extendedGuild);
  },
};

export default command;
