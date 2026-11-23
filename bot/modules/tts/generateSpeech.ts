import {
  reserveGuildTokens,
  settleGuildTokens,
  releaseGuildTokens,
  type GuildTokenState,
} from "../../../supabase/models/guildTokens.ts";
import convertToSpeech, {
  SpeechGenerationError,
  type ConvertedSpeech,
  type PreparedSpeech,
} from "./convertToSpeech.ts";

export async function generateSpeech(
  guildId: string,
  messageId: string,
  prepared: PreparedSpeech,
): Promise<{ speech: ConvertedSpeech; state: GuildTokenState } | null> {
  const reservation = await reserveGuildTokens(
    guildId,
    messageId,
    prepared.estimatedTokens,
  );
  // A repeated event must not regenerate audio or create another provider charge.
  if (!reservation.created) return null;

  let speech: ConvertedSpeech;
  try {
    speech = await convertToSpeech(prepared);
  } catch (error) {
    // A timeout or broken success response may already have cost provider credits.
    // Keep that hold for conservative recovery rather than making it free.
    if (
      error instanceof SpeechGenerationError &&
      !error.canReleaseReservation
    ) {
      throw error;
    }
    try {
      await releaseGuildTokens(guildId, messageId);
    } catch {
      await releaseGuildTokens(guildId, messageId);
    }
    throw error;
  }

  // Once the provider succeeded, never release the hold on a database error.
  // Repeating settlement is safe even when the first response was lost.
  let settlement;
  try {
    settlement = await settleGuildTokens(guildId, messageId, speech.tokensUsed);
  } catch {
    settlement = await settleGuildTokens(guildId, messageId, speech.tokensUsed);
  }
  if (settlement.status !== "settled") {
    throw new Error("Speech token settlement did not complete");
  }
  return { speech, state: settlement.state };
}
