import { BotCommand } from "../types.ts";
import { SlashCommandBuilder } from "@discordjs/builders";
import { installer } from "../modules/installer.ts";

const command: BotCommand = {
  guildId: "1179157503766962176",
  data: new SlashCommandBuilder()
    .setName("tts-install")
    .setDescription("Runs the TTS installation process for this guild."),
  requirements: {
    userPermissions: ["Administrator"],
  },

  async execute(interaction, client) {
    await installer(
      client,
      interaction,
      interaction.guild!,
      await interaction.guild!.fetchOwner(),
    );
  },
};

export default command;
