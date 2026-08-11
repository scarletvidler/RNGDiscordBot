import { MessageFlags, SlashCommandBuilder } from "discord.js";
import type { BotCommand } from "../../types.ts";
import { deleteDBGuild } from "../../../supabase/models/guilds.ts";
import { getErrorMessage } from "../../helpers/errors.ts";

const SUPPORT_GUILD_ID = "1179157503766962176";

const command: BotCommand = {
  guildId: SUPPORT_GUILD_ID,
  data: new SlashCommandBuilder()
    .setName("lerche-uninstall")
    .setDescription("Remove Lerche and its stored data from a server.")
    .addStringOption((option) =>
      option
        .setName("guild_id")
        .setDescription("The ID of the server to uninstall Lerche from.")
        .setRequired(true),
    )
    .addBooleanOption((option) =>
      option
        .setName("confirm")
        .setDescription("Confirm that Lerche should leave and delete its data.")
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
    const confirmed = interaction.options.getBoolean("confirm", true);

    if (!confirmed) {
      await interaction.editReply("[cancelled] Uninstall was not confirmed.");
      return;
    }

    if (guildId === SUPPORT_GUILD_ID) {
      await interaction.editReply(
        "[blocked] Lerche cannot uninstall itself from the support server.",
      );
      return;
    }

    let guild;
    try {
      guild = await client.guilds.fetch(guildId);
    } catch (error) {
      await interaction.editReply(
        `[failed] Lerche is not installed in guild ${guildId} (${getErrorMessage(error)}).`,
      );
      return;
    }

    const guildName = guild.name;

    try {
      const voiceInstance = client.activeVoiceConnections.get(guildId);
      if (voiceInstance) {
        await voiceInstance.destroy({
          destroyConnection: true,
          playDisconnectSound: false,
        });
      }

      await guild.leave();
      await deleteDBGuild(guildId);

      client.activeVoiceConnections.delete(guildId);
      client.installedGuilds = client.installedGuilds.filter(
        (installedGuild) => installedGuild.id !== guildId,
      );

      await interaction.editReply(
        `[uninstalled] ${guildName} (${guildId}). Lerche left the server and its stored guild data was deleted.`,
      );
    } catch (error) {
      await interaction.editReply(
        `[failed] Could not fully uninstall Lerche from ${guildName} (${guildId}): ${getErrorMessage(error)}`,
      );
    }
  },
};

export default command;
