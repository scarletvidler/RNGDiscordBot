import { SlashCommandBuilder } from "discord.js";
import { syncHowToDocs } from "../modules/syncHowToDocs.ts";
import type { BotCommand } from "../types.ts";

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("docs-please-ignore")
    .setDescription("Creates or updates the how-to docs forum posts.")
    .addStringOption((option) =>
      option
        .setName("channel-name")
        .setDescription(
          "The forum channel to sync into. Defaults to how-to-lerche.",
        )
        .setRequired(false),
    ),
  requirements: {
    userPermissions: ["Administrator"],
  },
  async execute(interaction): Promise<void> {
    await interaction.deferReply({ ephemeral: true });

    if (!interaction.guild) {
      await interaction.editReply("This command can only be used in a server.");
      return;
    }

    const channelName =
      interaction.options.getString("channel-name", false) ?? "how-to-lerche";
    const result = await syncHowToDocs(interaction.guild, channelName);

    const lines = [
      `Docs synced to #${channelName}.`,
      `Created: ${result.created.length || 0}`,
      `Updated: ${result.updated.length || 0}`,
      `Skipped: ${result.skipped.length || 0}`,
    ];

    if (result.created.length > 0) {
      lines.push(`Created posts: ${result.created.join(", ")}`);
    }

    if (result.updated.length > 0) {
      lines.push(`Updated posts: ${result.updated.join(", ")}`);
    }

    if (result.skipped.length > 0) {
      lines.push(`Skipped: ${result.skipped.join(" | ")}`);
    }

    await interaction.editReply(lines.join("\n"));
  },
};

export default command;
