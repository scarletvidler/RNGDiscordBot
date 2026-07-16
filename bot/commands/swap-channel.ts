import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { BotCommand, channelWithPlayer } from "../types.ts";
import clientInstance from "../modules/client.ts";
import invariant from "tiny-invariant";
import {
  entersState,
  joinVoiceChannel,
  VoiceConnectionStatus,
} from "@discordjs/voice";

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("swap-channel")
    .setDescription(
      "Swaps the bot's current channel to be the user's current one.",
    ),
  requirements: {
    userPermissions: ["Administrator"],
  },
  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    const voiceChannel: any =
      interaction.member && "voice" in interaction.member
        ? interaction.member.voice.channel
        : null;
    invariant(
      voiceChannel,
      "You need to be in a voice channel to use this command.",
    );
    invariant(interaction.guildId, "Command must be used in a server.");

    const newConn = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: interaction.guildId,
      adapterCreator: voiceChannel.guild.voiceAdapterCreator,
      selfDeaf: true,
    });

    await entersState(newConn, VoiceConnectionStatus.Ready, 30_000);

    if (!voiceChannel.player) {
      const cachedChannel = clientInstance.channels.cache.find(
        (c): c is channelWithPlayer =>
          "player" in c && Boolean((c as channelWithPlayer).player),
      ) as channelWithPlayer | undefined;

      if (cachedChannel?.player) {
        voiceChannel.player = cachedChannel.player;
        voiceChannel.player._setConnection(newConn);
        newConn.subscribe(voiceChannel.player.audioInstance);
      }
    }

    await interaction.reply(`Moved to ${voiceChannel.name}.`);
  },
};

export default command;
