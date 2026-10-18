import {
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import type { BotCommand } from "../types.ts";
import { getGuildPremiumState } from "../../supabase/models/monetization.ts";
import { setUpExtendedGuild } from "../modules/startGuilds.ts";

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("premium-status")
    .setDescription("Shows this server's Lerche subscription and token status."),
  requirements: {
    userPermissions: ["Administrator"],
  },
  async execute(interaction, client) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const guild = await setUpExtendedGuild(interaction.guild!, client);
    const state = await getGuildPremiumState(interaction.guildId!);
    const balance = Math.max(
      guild.settings.logging.token_limit -
        guild.settings.logging.token_total_usage,
      0,
    );

    if (!state.entitlement || !state.sku) {
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0x95a5a6)
            .setTitle("Lerche Premium")
            .setDescription(
              "This server does not currently have an active Discord subscription. Use `/premium` to see the available plans.",
            )
            .addFields({
              name: "Current token balance",
              value: balance.toLocaleString(),
            }),
        ],
      });
      return;
    }

    const periodEnd = state.subscription?.current_period_end;
    const billingMessage = state.subscription?.canceled_at
      ? `Cancelled; access remains through ${formatDiscordTimestamp(periodEnd)}`
      : periodEnd
        ? `Current period ends ${formatDiscordTimestamp(periodEnd)}`
        : "Active";

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0x57f287)
          .setTitle("Lerche Premium is active")
          .addFields(
            { name: "Plan", value: state.sku.name, inline: true },
            {
              name: "Monthly tokens",
              value: state.sku.tokens_per_period.toLocaleString(),
              inline: true,
            },
            {
              name: "Current balance",
              value: balance.toLocaleString(),
              inline: true,
            },
            { name: "Billing", value: billingMessage },
            {
              name: "Last token grant",
              value: state.latestGrant
                ? `${state.latestGrant.amount.toLocaleString()} tokens on ${formatDiscordTimestamp(state.latestGrant.created_at)}`
                : "No grant has been recorded yet.",
            },
          ),
      ],
    });
  },
};

function formatDiscordTimestamp(value: string | null | undefined): string {
  if (!value) return "an unknown date";
  return `<t:${Math.floor(Date.parse(value) / 1000)}:F>`;
}

export default command;
