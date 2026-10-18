import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import type { BotCommand } from "../types.ts";
import { getActiveDiscordSkus } from "../../supabase/models/monetization.ts";

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("premium")
    .setDescription("Shows Lerche's premium token plans for this server."),
  requirements: {
    userPermissions: ["Administrator"],
  },
  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const skus = await getActiveDiscordSkus();
    if (skus.length === 0) {
      await interaction.editReply(
        "Lerche's Discord subscription plans have not been published yet.",
      );
      return;
    }
    const displayedSkus = skus.slice(0, 25);

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("Lerche Premium")
      .setDescription(
        [
          "Subscribe for this server without leaving Discord.",
          "Each successful monthly renewal adds the plan's tokens to the server balance.",
          "Previously granted tokens do not disappear if the subscription is cancelled.",
        ].join("\n"),
      )
      .addFields(
        displayedSkus.map((sku) => ({
          name: sku.name,
          value: `${sku.tokens_per_period.toLocaleString()} tokens per billing period`,
          inline: true,
        })),
      );

    const rows: ActionRowBuilder<ButtonBuilder>[] = [];
    for (let index = 0; index < displayedSkus.length; index += 5) {
      const row = new ActionRowBuilder<ButtonBuilder>();
      row.addComponents(
        displayedSkus.slice(index, index + 5).map((sku) =>
          new ButtonBuilder()
            .setStyle(ButtonStyle.Premium)
            .setSKUId(sku.sku_id),
        ),
      );
      rows.push(row);
    }

    await interaction.editReply({ embeds: [embed], components: rows });
  },
};

export default command;
