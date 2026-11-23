import {
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import type { BotCommand } from "../types.ts";
import { redeemAvailableGuildTopups } from "../modules/monetization.ts";

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("tokens-redeem")
    .setDescription("Redeems your unclaimed token packs into this server.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  requirements: {
    userPermissions: ["ManageGuild"],
  },
  async execute(interaction, client, guild) {
    // Verify the recipient permission here too; the shared command wrapper has
    // an owner override that must not change the buyer's redemption authority.
    if (
      !interaction.guildId ||
      interaction.guildId !== guild.id ||
      !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
    ) {
      await interaction.reply({
        content:
          "You need Manage Server permission to redeem tokens into this server.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const result = await redeemAvailableGuildTopups(
        client,
        interaction.user.id,
        guild.id,
      );
      if (result.redeemed === 0 && result.failed === 0) {
        await interaction.editReply(
          "No unclaimed token packs were found for your account.",
        );
        return;
      }

      const message =
        result.redeemed > 0
          ? `Redeemed ${result.redeemed} token pack${result.redeemed === 1 ? "" : "s"} into this server.`
          : "Your token packs could not be redeemed yet.";
      await interaction.editReply(
        result.failed > 0
          ? `${message} Please try again for any packs that are still unclaimed.`
          : message,
      );
    } catch {
      console.error("[monetization] could not redeem the buyer's token packs");
      await interaction.editReply(
        "I couldn't finish checking your token packs. Please try again; redeemed packs won't be added twice.",
      );
    }
  },
};

export default command;
