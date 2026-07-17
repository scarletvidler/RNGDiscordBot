import { BotCommand } from "../types.ts";
import { SlashCommandBuilder } from "@discordjs/builders";

const command: BotCommand = {
  guildId: "1179157503766962176",
  data: new SlashCommandBuilder()
    .setName("send-user-dm")
    .setDescription("Send a direct message to a user")
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("The user to send a DM to")
        .setRequired(true),
    )
    .addStringOption((option) =>
      option
        .setName("message")
        .setDescription("The message to send")
        .setRequired(true),
    ),
  requirements: {
    userPermissions: ["Administrator"],
  },
  async execute(interaction, client) {
    const user = interaction.options.getUser("user");
    const message = interaction.options.getString("message");
    if (user && message) {
      try {
        await user.send(message);
        await interaction.reply({ content: "Message sent!", ephemeral: true });
      } catch (error) {
        console.error("Error sending DM:", error);
        await interaction.reply({
          content: "Failed to send message.",
          ephemeral: true,
        });
      }
    }
  },
};

export default command;
