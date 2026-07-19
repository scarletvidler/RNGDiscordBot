import { MessageFlags, SlashCommandBuilder } from "discord.js";
import type { BotCommand } from "../types.ts";
import { sendGuildAnnouncement } from "../modules/sendGuildAnnouncement.ts";

const SUPPORT_GUILD_ID = "1179157503766962176";

const command: BotCommand = {
  guildId: SUPPORT_GUILD_ID,
  data: new SlashCommandBuilder()
    .setName("lerche-forward")
    .setDescription(
      "Forward a message to the Lerche Updates channel in one server.",
    )
    .addStringOption((option) =>
      option
        .setName("guild_id")
        .setDescription("The target server ID.")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("message")
        .setDescription("The message to forward.")
        .setRequired(true),
    ),
  requirements: {
    userPermissions: ["Administrator"],
  },
  async execute(interaction, client) {
    await interaction.deferReply({
      flags: MessageFlags.Ephemeral,
    });

    const guildId = interaction.options.getString("guild_id", true);
    const message = interaction.options.getString("message", true);

    try {
      const guild = await client.guilds.fetch(guildId);
      const result = await sendGuildAnnouncement(guild, message);

      if (!result.ok) {
        await interaction.editReply(
          `[skipped] ${result.guildName} (${result.reason ?? "unknown error"})`,
        );
        return;
      }

      await interaction.editReply(`[sent] ${result.guildName}`);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      await interaction.editReply(
        `[skipped] Could not access guild ${guildId} (${reason})`,
      );
    }
  },
};

export default command;
