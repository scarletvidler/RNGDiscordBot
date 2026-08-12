// Disable TTS replies for this guild

import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { BotCommand } from "../types.ts";
import { DBGuildWithSettings } from "../../supabase/models/guilds.ts";
import { setUpExtendedGuild } from "../modules/startGuilds.ts";

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("info-token-count")
    .setDescription("Shows the remaining TTS token balance for this guild."),
  requirements: {
    userPermissions: ["Administrator"],
  },
  async execute(interaction, client) {
    await interaction.deferReply();
    const embed = new EmbedBuilder().setColor(0xe74c3c);
    const extendedGuild = await setUpExtendedGuild(interaction.guild!, client);
    const tokenUsage = extendedGuild.settings.logging.token_total_usage;
    const tokenLimit = extendedGuild.settings.logging.token_limit;
    const tokenBalance = tokenLimit - tokenUsage;

    const isFreeTier = tokenLimit <= 10000; // Assuming free tier has a limit of 1,000,000 tokens

    const message = isFreeTier
      ? `**Remaining Balance:** ${tokenBalance.toLocaleString()} tokens. Be careful not to use too many tokens, this is the free trial!`
      : `This guild is on a paid tier. **Remaining Balance:** ${tokenBalance.toLocaleString()} tokens.`;

    // Update the guild settings to toggle TTS replies

    embed.setTitle("TTS Token Usage");
    embed.setDescription(message);
    await interaction.editReply({ embeds: [embed] });
  },
};

export default command;
