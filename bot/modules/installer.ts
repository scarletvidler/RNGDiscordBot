import {
  Guild,
  User,
  GuildMember,
  SendableChannels,
  StringSelectMenuBuilder,
  ActionRowBuilder,
  ChatInputCommandInteraction,
} from "discord.js";
import { ExtendedClient } from "../types.ts";
import {
  assertLercheCanPerformActionInChannel,
  getLercheMemberPermissions,
} from "./permissions/index.ts";
import { PermissionName } from "./permissions/permissionNames.ts";

export async function installer(
  client: ExtendedClient,
  interaction: ChatInputCommandInteraction,
  guild: Guild,
  guildOwner: GuildMember,
): Promise<void> {
  console.log(
    "Running installer for guild:",
    guild.name,
    "with owner:",
    guildOwner.user.username,
  );

  // TODO: Check Audit Log to get the user who installed Lerche //

  // Check if permissions for systemChannel to send a message for installer questions
  // If not, send the next steps in a dm to the guild owner
  const locationToInstall = await getWhereToSendInstallerMessage(
    client,
    guild,
    guildOwner,
  );

  // Steps for installation //
  // 1. Ask which channel to use for tts messages

  const lercheListenRoleSelection = new StringSelectMenuBuilder()
    .setCustomId("lerche-listen-role-selection")
    .setPlaceholder("Select a role for Lerche to listen to for TTS messages")
    .addOptions(
      guild.roles.cache
        .filter((role) => role.name !== "@everyone")
        .map((role) => ({
          label: role.name,
          value: role.id,
        })),
    );

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    lercheListenRoleSelection,
  );
  // Reply with the action row
  const roleToListenToMessage = await interaction.reply({
    content:
      "Please select a role for Lerche to listen to for TTS messages. Only users with this role will be able to use the TTS functionality.",
    components: [row],
    ephemeral: false,
    withResponse: true,
  });

  const collectorFilter = (i) => i.user.id === interaction.user.id;

  try {
    const confirmation =
      await roleToListenToMessage.resource.message.awaitMessageComponent({
        filter: collectorFilter,
        time: 60_000,
      });
    await interaction.editReply({
      content: `You selected the role: <@&${confirmation.values[0]}>`,
      components: [],
    });
  } catch {
    await interaction.editReply({
      content: "Confirmation not received within 1 minute, cancelling",
      components: [],
    });
  }

  // 2. Ask which role should Lerche Listen to for tts messages
  // 3. Ask which setting to use for tts messages (/t or normal)
  // 4. Ask if tts replies should be sent
  // 5. Ask if tts error messages should be sent to the channel or to a specific logging channel
  // 6. Ask if Lerche can create a lerche-updates channel for updates and announcements

  return;
}

async function getWhereToSendInstallerMessage(
  client: ExtendedClient,
  guild: Guild,
  guildOwner: GuildMember,
): Promise<SendableChannels | User> {
  const channel =
    guild.systemChannel ??
    guild.channels.cache.find(
      (c) =>
        c.isTextBased() &&
        c.permissionsFor(guild.members.me!).has("SendMessages") &&
        c.permissionsFor(guild.members.me!).has("ViewChannel") &&
        c.type === 0, // Text channel
    );

  if (
    channel &&
    (await assertLercheCanPerformActionInChannel(guild, channel, [
      PermissionName.SendMessages,
      PermissionName.ViewChannel,
    ]))
  ) {
    if (channel.isSendable()) {
      return channel;
    }
  }

  return guildOwner.user;
}
