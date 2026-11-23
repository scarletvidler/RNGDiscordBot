import { EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { BotCommand } from "../types.ts";
import { getGuildTokenState } from "../../supabase/models/guildTokens.ts";

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("info-token-count")
    .setDescription("Shows the remaining TTS token balance for this guild."),
  requirements: {
    userPermissions: ["Administrator"],
  },
  async execute(interaction, _client, guild) {
    await interaction.deferReply();
    const embed = new EmbedBuilder().setColor(0xe74c3c);
    const state = await getGuildTokenState(guild.id);
    if (!state) throw new Error("Guild token balance is unavailable");
    const tokenBalance = Math.max(state.token_balance, 0);
    const message = `**Available Balance:** ${tokenBalance.toLocaleString()} Lerche Tokens.`;

    embed.setTitle("TTS Token Usage");
    embed.setDescription(
      state.has_active_subscription
        ? `${message}\nThis server has an active subscription.`
        : message,
    );
    await interaction.editReply({ embeds: [embed] });
  },
};

export default command;
