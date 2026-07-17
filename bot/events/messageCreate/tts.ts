import type { Message } from "discord.js";
import invariant from "tiny-invariant";
import type { ExtendedClient } from "../../types.ts";
import isValidTTS from "../../modules/tts/isValidTTS.ts";
import { TTSInstance } from "../../modules/tts/TTSInstance.ts";
import { setUpExtendedGuild } from "../../modules/setUpGuilds.ts";
import {
  hasReachedUsageLimit,
  usageLimitReachedMessage,
} from "../../modules/supportMessages.ts";
import { getErrorMessage } from "../../helpers/errors.ts";

export async function handleTtsMessage(
  message: Message<true>,
  client: ExtendedClient,
): Promise<void> {
  try {
    if (!isValidTTS(message)) return;

    try {
      let guild = client.installedGuilds.find((g) => g.id === message.guildId);
      if (!guild) {
        console.error(
          `Guild not found for message: ${message.id}, guildId: ${message.guildId}`,
        );
        guild = await setUpExtendedGuild(message.guild, client);
        invariant(guild, "Guild not found in installedGuilds");
      }

      if (hasReachedUsageLimit(guild)) {
        await message.reply(usageLimitReachedMessage(guild));
        return;
      }

      const tts = await TTSInstance.create(message, guild, client);
      await tts.run();
    } catch (error) {
      console.error("Error processing TTS message:", error);
      await message.reply(
        "There was an error processing your TTS message. Please try again later.",
      );
    }
  } catch (error) {
    console.error("TTS validation error:", getErrorMessage(error));
    await message.reply(`TTS validation failed: ${getErrorMessage(error)}`);
  }
}
