import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  type ChatInputCommandInteraction,
  Guild,
  MessageFlags,
  ModalBuilder,
  PermissionFlagsBits,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  type TextChannel,
} from "discord.js";
import { TTSModels, type ExtendedClient } from "../types.ts";
import {
  DEFAULTS,
  getDefaultVoiceId,
  isTTSModel,
  TTS_MODELS,
} from "../config/defaults.ts";
import {
  DBUpsertGuildTTSSettings,
  syncGuildTTSSettingsWithDB,
  type DBGuildWithSettings,
} from "../../supabase/models/guilds.ts";
import ElevenLabs from "./ElevenLabs.ts";
import FishAudio from "./FishAudio.ts";
import { canLerchePerformAction, PermissionName } from "./permissions/index.ts";

const INSTALLER_TIMEOUT = 5 * 60_000;
const REQUIRED_TEXT_PERMISSIONS = [
  PermissionName.ViewChannel,
  PermissionName.SendMessages,
  PermissionName.ReadMessageHistory,
];

class InstallerCancelled extends Error {}

type InstallerMessage = Awaited<
  ReturnType<ChatInputCommandInteraction["fetchReply"]>
>;
type ChannelChoice =
  | { create: true; channel: null }
  | { create: false; channel: TextChannel }
  | null;

export async function installer(
  _client: ExtendedClient,
  interaction: ChatInputCommandInteraction,
  guild: Guild,
  extendedGuild: DBGuildWithSettings,
): Promise<void> {
  const id = `tts-install:${interaction.id}`;

  await interaction.reply({
    content:
      "Let’s configure Lerche. Your existing settings will not change until you confirm the final summary.",
    flags: MessageFlags.Ephemeral,
  });
  const message = await interaction.fetchReply();

  try {
    const listenRoleId = await askForListenRole(interaction, message, id);
    const roomPrefixEnabled = await askForMode(interaction, message, id);
    const channelChoice = roomPrefixEnabled
      ? null
      : await askForChannel(interaction, message, guild, id);
    const model = await askForModel(interaction, message, id);
    const requestedVoiceId = await askForVoice(interaction, message, model, id);
    const voiceId = await validateVoice(model, requestedVoiceId);

    const confirmed = await askForConfirmation(
      interaction,
      message,
      guild,
      listenRoleId,
      roomPrefixEnabled,
      channelChoice,
      model,
      voiceId,
      id,
    );
    if (!confirmed) throw new InstallerCancelled("Setup cancelled.");

    let createdChannel: TextChannel | null = null;
    try {
      if (channelChoice?.create) {
        createdChannel = await guild.channels.create({
          name: DEFAULTS.ttsChannelName,
          type: ChannelType.GuildText,
          reason: `Lerche setup confirmed by ${interaction.user.tag}`,
          permissionOverwrites: [
            {
              id: guild.members.me!.id,
              allow: [
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.ReadMessageHistory,
              ],
            },
          ],
        });

        const permissionResult = await canLerchePerformAction(
          guild,
          REQUIRED_TEXT_PERMISSIONS,
          createdChannel,
        );
        if (!permissionResult.allowed) {
          throw new Error(
            `The new channel is missing: ${permissionResult.missingPermissions.join(", ")}.`,
          );
        }
      }

      const selectedChannel = createdChannel ?? channelChoice?.channel ?? null;
      const settings = await DBUpsertGuildTTSSettings({
        guild_id: guild.id,
        listen_role_id: listenRoleId,
        room_prefix_enabled: roomPrefixEnabled,
        tts_channel_id: selectedChannel?.id ?? null,
        tts_channel_name: selectedChannel?.name ?? DEFAULTS.ttsChannelName,
        default_voice_id: voiceId,
        tts_model: model,
        setup_completed_at: new Date().toISOString(),
      });
      syncGuildTTSSettingsWithDB(settings, extendedGuild);
    } catch (error) {
      if (createdChannel) {
        await createdChannel
          .delete("Rolling back an incomplete Lerche installation")
          .catch((deleteError) =>
            console.error(
              "Failed to roll back created TTS channel:",
              deleteError,
            ),
          );
      }
      throw error;
    }

    const channelText = roomPrefixEnabled
      ? "`/t` room mode"
      : `<#${createdChannel?.id ?? channelChoice?.channel?.id}>`;
    await interaction.editReply({
      content: `Lerche is configured successfully. TTS is available to ${formatRole(guild, listenRoleId)} using ${channelText}, with **${TTS_MODELS[model].label}** as the default model.`,
      components: [],
    });
  } catch (error) {
    const timedOut =
      error instanceof Error &&
      error.message.includes("ending with reason: time");
    const messageText =
      error instanceof InstallerCancelled
        ? error.message
        : timedOut
          ? "Setup timed out before a selection was made. Run `/tts-install` to start again."
          : `Setup could not be completed: ${error instanceof Error ? error.message : "Unknown error"}`;
    if (!(error instanceof InstallerCancelled)) {
      console.error(`Installer failed for guild ${guild.id}:`, error);
    }
    await interaction
      .editReply({ content: messageText, components: [] })
      .catch(() => undefined);
  }
}

async function askForListenRole(
  interaction: ChatInputCommandInteraction,
  message: InstallerMessage,
  id: string,
): Promise<string | null> {
  const roleMenu = new RoleSelectMenuBuilder()
    .setCustomId(`${id}:role`)
    .setPlaceholder("Choose a role")
    .setMinValues(1)
    .setMaxValues(1);
  const everyoneButton = new ButtonBuilder()
    .setCustomId(`${id}:everyone`)
    .setLabel("Everyone")
    .setStyle(ButtonStyle.Secondary);

  await interaction.editReply({
    content:
      "Who may use Lerche TTS? Choose one role, or choose **Everyone** to allow all server members.",
    components: [
      new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(roleMenu),
      new ActionRowBuilder<ButtonBuilder>().addComponents(everyoneButton),
    ],
  });
  const selection = await message.awaitMessageComponent({
    filter: (component) =>
      component.user.id === interaction.user.id &&
      component.customId.startsWith(id),
    time: INSTALLER_TIMEOUT,
  });
  await selection.deferUpdate();

  if (selection.isButton()) return interaction.guildId;
  if (!selection.isRoleSelectMenu()) {
    throw new InstallerCancelled("Invalid role selection; setup cancelled.");
  }
  const roleId = selection.values[0];
  return roleId;
}

async function askForMode(
  interaction: ChatInputCommandInteraction,
  message: InstallerMessage,
  id: string,
): Promise<boolean> {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`${id}:mode`)
    .setPlaceholder("Choose how messages trigger TTS")
    .addOptions(
      {
        label: "Dedicated TTS channel",
        value: "channel",
        description: "Every eligible message in one text channel is spoken.",
      },
      {
        label: "/t room mode",
        value: "prefix",
        description: "Use /t message anywhere to speak in your voice room.",
      },
    );

  await interaction.editReply({
    content:
      "Choose a TTS mode. A **dedicated channel** reads eligible messages automatically. **`/t` room mode** only reads messages beginning with `/t` and plays them in the sender’s current voice channel.",
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu),
    ],
  });
  const selection = await message.awaitMessageComponent({
    filter: (component) =>
      component.user.id === interaction.user.id &&
      component.customId === `${id}:mode`,
    time: INSTALLER_TIMEOUT,
  });
  if (!selection.isStringSelectMenu()) {
    throw new InstallerCancelled("Invalid mode selection; setup cancelled.");
  }
  await selection.deferUpdate();
  return selection.values[0] === "prefix";
}

async function askForChannel(
  interaction: ChatInputCommandInteraction,
  message: InstallerMessage,
  guild: Guild,
  id: string,
): Promise<Exclude<ChannelChoice, null>> {
  const createMenu = new StringSelectMenuBuilder()
    .setCustomId(`${id}:create-channel`)
    .setPlaceholder("Create or select a channel")
    .addOptions(
      {
        label: "Create Lerche TTS",
        value: "create",
        description: "Allow Lerche to create and configure a new text channel.",
      },
      {
        label: "Use an existing channel",
        value: "existing",
        description: "Select a text channel that already exists.",
      },
    );
  await interaction.editReply({
    content: "May Lerche create a dedicated **Lerche TTS** text channel?",
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(createMenu),
    ],
  });
  const choice = await message.awaitMessageComponent({
    filter: (component) =>
      component.user.id === interaction.user.id &&
      component.customId === `${id}:create-channel`,
    time: INSTALLER_TIMEOUT,
  });
  if (!choice.isStringSelectMenu()) {
    throw new InstallerCancelled("Invalid channel choice; setup cancelled.");
  }
  await choice.deferUpdate();

  if (choice.values[0] === "create") {
    const result = await canLerchePerformAction(guild, [
      PermissionName.ManageChannels,
    ]);
    if (!result.allowed) {
      throw new Error(
        `Lerche cannot create a channel because she is missing: ${result.missingPermissions.join(", ")}. Rerun setup after granting it, or choose an existing channel.`,
      );
    }
    return { create: true, channel: null };
  }

  while (true) {
    const channelMenu = new ChannelSelectMenuBuilder()
      .setCustomId(`${id}:channel`)
      .setPlaceholder("Choose a text channel")
      .setChannelTypes(ChannelType.GuildText)
      .setMinValues(1)
      .setMaxValues(1);
    await interaction.editReply({
      content:
        "Choose the existing text channel Lerche should use. She must be able to view it, send messages, and read message history.",
      components: [
        new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
          channelMenu,
        ),
      ],
    });
    const selection = await message.awaitMessageComponent({
      filter: (component) =>
        component.user.id === interaction.user.id &&
        component.customId === `${id}:channel`,
      time: INSTALLER_TIMEOUT,
    });
    if (!selection.isChannelSelectMenu()) {
      throw new InstallerCancelled(
        "Invalid channel selection; setup cancelled.",
      );
    }
    await selection.deferUpdate();

    const channel = await guild.channels.fetch(selection.values[0]);
    if (!channel || channel.type !== ChannelType.GuildText) continue;
    const result = await canLerchePerformAction(
      guild,
      REQUIRED_TEXT_PERMISSIONS,
      channel,
    );
    if (result.allowed) return { create: false, channel };

    await interaction.editReply({
      content: `Lerche cannot use <#${channel.id}> because she is missing: **${result.missingPermissions.join(", ")}**. Fix its permissions or select another channel.`,
      components: [
        new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
          channelMenu,
        ),
      ],
    });
  }
}

async function askForModel(
  interaction: ChatInputCommandInteraction,
  message: InstallerMessage,
  id: string,
): Promise<TTSModels> {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`${id}:model`)
    .setPlaceholder("Choose the default TTS model")
    .addOptions(
      Object.entries(TTS_MODELS).map(([value, definition]) => ({
        label: definition.label,
        value,
        description: definition.description,
      })),
    );
  await interaction.editReply({
    content:
      "Choose the default model. Members with personal or role voices may override this for their own messages.",
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu),
    ],
  });
  const selection = await message.awaitMessageComponent({
    filter: (component) =>
      component.user.id === interaction.user.id &&
      component.customId === `${id}:model`,
    time: INSTALLER_TIMEOUT,
  });
  if (!selection.isStringSelectMenu()) {
    throw new InstallerCancelled("Invalid model selection; setup cancelled.");
  }
  await selection.deferUpdate();
  const model = selection.values[0];
  if (!isTTSModel(model)) throw new Error("The selected model is unsupported.");
  return model;
}

async function askForVoice(
  interaction: ChatInputCommandInteraction,
  message: InstallerMessage,
  model: TTSModels,
  id: string,
): Promise<string> {
  const button = new ButtonBuilder()
    .setCustomId(`${id}:voice-open`)
    .setLabel("Choose default voice")
    .setStyle(ButtonStyle.Primary);
  await interaction.editReply({
    content: `Set the default voice for **${TTS_MODELS[model].label}**. The field is prefilled with Lerche’s configured default, and you may replace it with another accessible voice ID.`,
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(button)],
  });
  const trigger = await message.awaitMessageComponent({
    filter: (component) =>
      component.user.id === interaction.user.id &&
      component.customId === `${id}:voice-open`,
    time: INSTALLER_TIMEOUT,
  });
  if (!trigger.isButton()) {
    throw new InstallerCancelled("Invalid voice selection; setup cancelled.");
  }

  const input = new TextInputBuilder()
    .setCustomId(`${id}:voice-id`)
    .setLabel("Voice ID")
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setValue(getDefaultVoiceId(model));
  const modal = new ModalBuilder()
    .setCustomId(`${id}:voice-modal`)
    .setTitle("Choose the default voice")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(input),
    );
  await trigger.showModal(modal);

  const submission = await trigger.awaitModalSubmit({
    filter: (modalInteraction) =>
      modalInteraction.user.id === interaction.user.id &&
      modalInteraction.customId === `${id}:voice-modal`,
    time: INSTALLER_TIMEOUT,
  });
  await submission.deferUpdate();
  return submission.fields.getTextInputValue(`${id}:voice-id`).trim();
}

async function validateVoice(
  model: TTSModels,
  requestedVoiceId: string,
): Promise<string> {
  if (!requestedVoiceId) throw new Error("A default voice ID is required.");
  try {
    if (TTS_MODELS[model].provider === "fish") {
      return await FishAudio.getInstance().ensureVoiceAvailable(
        requestedVoiceId,
      );
    }
    return await ElevenLabs.getInstance().ensureVoiceAvailable(
      requestedVoiceId,
    );
  } catch (error) {
    console.error("Default voice validation failed:", error);
    throw new Error(
      `The voice ID ${requestedVoiceId} is not accessible for ${TTS_MODELS[model].label}.`,
    );
  }
}

async function askForConfirmation(
  interaction: ChatInputCommandInteraction,
  message: InstallerMessage,
  guild: Guild,
  roleId: string | null,
  roomPrefixEnabled: boolean,
  channelChoice: ChannelChoice,
  model: TTSModels,
  voiceId: string,
  id: string,
): Promise<boolean> {
  const mode = roomPrefixEnabled
    ? "`/t` room mode"
    : channelChoice?.create
      ? "Create a new **Lerche TTS** channel"
      : `<#${channelChoice?.channel.id}>`;
  const confirm = new ButtonBuilder()
    .setCustomId(`${id}:confirm`)
    .setLabel("Confirm setup")
    .setStyle(ButtonStyle.Success);
  const cancel = new ButtonBuilder()
    .setCustomId(`${id}:cancel`)
    .setLabel("Cancel")
    .setStyle(ButtonStyle.Secondary);
  await interaction.editReply({
    content: [
      "**Confirm Lerche setup**",
      `Allowed users: ${formatRole(guild, roleId)}`,
      `Mode/channel: ${mode}`,
      `Default model: **${TTS_MODELS[model].label}**`,
      `Default voice ID: \`${voiceId}\``,
    ].join("\n"),
    components: [
      new ActionRowBuilder<ButtonBuilder>().addComponents(confirm, cancel),
    ],
  });
  const selection = await message.awaitMessageComponent({
    filter: (component) =>
      component.user.id === interaction.user.id &&
      (component.customId === `${id}:confirm` ||
        component.customId === `${id}:cancel`),
    time: INSTALLER_TIMEOUT,
  });
  if (!selection.isButton()) return false;
  await selection.deferUpdate();
  return selection.customId === `${id}:confirm`;
}

function formatRole(guild: Guild, roleId: string | null): string {
  if (roleId === guild.id) return "Everyone";
  return roleId && guild.roles.cache.has(roleId)
    ? `<@&${roleId}>`
    : "the legacy Lerche Listens role";
}
