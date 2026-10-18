// Disable TTS replies for this guild

import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { BotCommand } from "../types.ts";
import { DBGuildWithSettings } from "../../supabase/models/guilds.ts";
import { setUpExtendedGuild } from "../modules/startGuilds.ts";
import { getGuildPremiumState } from "../../supabase/models/monetization.ts";

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
    const tokenBalance = Math.max(tokenLimit - tokenUsage, 0);
    const premiumState = await getGuildPremiumState(interaction.guildId!);

    const message = premiumState.entitlement
      ? `This server has an active **${premiumState.sku?.name ?? "Lerche Premium"}** subscription. **Remaining Balance:** ${tokenBalance.toLocaleString()} tokens.`
      : `**Remaining Balance:** ${tokenBalance.toLocaleString()} tokens. Use \`/premium\` to add a monthly token plan for this server.`;

    // Update the guild settings to toggle TTS replies

    embed.setTitle("TTS Token Usage");
    embed.setDescription(message);
    await interaction.editReply({ embeds: [embed] });
  },
};

export default command;
