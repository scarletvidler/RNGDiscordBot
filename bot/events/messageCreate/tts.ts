import type { Message } from "discord.js";
import invariant from "tiny-invariant";
import type { ExtendedClient } from "../../types.ts";
import isValidTTS from "../../modules/tts/isValidTTS.ts";
import { TTSInstance } from "../../modules/tts/TTSInstance.ts";
import { setUpExtendedGuild } from "../../modules/startGuilds.ts";
import {
  hasReachedUsageLimit,
  usageLimitReachedMessage,
} from "../../modules/supportMessages.ts";
import { getErrorMessage } from "../../helpers/errors.ts";
import { violatesLercheRules } from "../../modules/tts/textModeration.ts";
import {
  canUseTtsAfterVoteCheck,
  voteRequiredMessage,
} from "../../modules/tts/voteGate.ts";
import { refreshGuildRuntimeState } from "../../modules/tts/guildRuntimeState.ts";

const TTS_RULES_VIOLATION_MESSAGE =
  "This message was not translated as it violated Lerche's allowed rules.";
const VOTE_CHECK_FAILED_MESSAGE =
  "I couldn't verify your Top.gg vote right now. Please try your TTS message again in a moment.";

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
      } else {
        // Refresh mutable runtime fields at most once per minute per guild.
        await refreshGuildRuntimeState(guild);
      }

      if (hasReachedUsageLimit(guild)) {
        await message.reply(usageLimitReachedMessage(guild));
        return;
      }

      let hasVoteAccess: boolean;
      try {
        hasVoteAccess = await canUseTtsAfterVoteCheck(message, guild);
      } catch (error) {
        console.error("Failed to verify Top.gg vote:", error);
        await message.reply(VOTE_CHECK_FAILED_MESSAGE);
        return;
      }

      if (!hasVoteAccess) {
        await message.reply(voteRequiredMessage(client.user!.id));
        return;
      }

      if (await violatesLercheRules(message.content)) {
        console.warn(`Lerche AI Text Violated: "${message.content}"`);
        await message.reply(TTS_RULES_VIOLATION_MESSAGE);
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
    console.error("Failed TTS message:", message.content);
    await message.reply(`TTS validation failed: ${getErrorMessage(error)}`);
  }
}
