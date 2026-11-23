import { EmbedBuilder, type MessageCreateOptions } from "discord.js";
import { DBGuildWithSettings } from "../../supabase/models/guilds.ts";

export const TOKEN_WARNING_START = 100;
const SUPPORT_GIF_URL = "https://c.tenor.com/Q70pTPV9w6YAAAAC/tenor.gif";

export function usageMessage(
  totalUsage: number,
  guild: DBGuildWithSettings,
): MessageCreateOptions {
  const allowance = guild.settings.logging.token_limit;
  const remainingTokens = Math.max(allowance - totalUsage, 0);
  const embed = new EmbedBuilder()
    .setColor(0xffb347)
    .setTitle("Lerche Usage Notice")
    .setDescription(
      `Your server has **${remainingTokens.toLocaleString()} Lerche Tokens remaining**. TTS pauses when your tokens run out.

New servers receive a small starter allowance of **1,000 Lerche Tokens** to try Lerche. Voice generation costs money, so this free allowance is limited.

Use \`/info-token-count\` to check your server's balance. For help getting more tokens, use \`/help\` or visit https://www.patreon.com/cw/LercheTTS.`,
    )
    .addFields(
      {
        name: "📊 Current Total Usage",
        value: `${totalUsage.toLocaleString()} tokens`,
        inline: true,
      },
      {
        name: "⏳ Remaining Before Cutoff",
        value: `${remainingTokens.toLocaleString()} tokens`,
        inline: true,
      },
    )
    .setImage(SUPPORT_GIF_URL);

  return { embeds: [embed] };
}

export function usageLimitReachedMessage(
  guild: DBGuildWithSettings,
): MessageCreateOptions {
  const totalUsage = guild.settings.logging.token_total_usage;
  const embed = new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle("Lerche TTS Paused")
    .setDescription(
      [
        "Your server has run out of Lerche Tokens, so TTS is paused.",
        "",
        "New servers receive a small starter allowance of **1,000 Lerche Tokens** to try Lerche. Voice generation costs money, so this free allowance is limited.",
        "",
        "Use `/info-token-count` to check your server's balance. For help getting more tokens, use `/help` or visit https://www.patreon.com/cw/LercheTTS.",
      ].join("\n"),
    )
    .addFields({
      name: "📊 Current Total Usage",
      value: `${totalUsage.toLocaleString()} tokens`,
      inline: true,
    })
    .setImage(SUPPORT_GIF_URL);

  return { embeds: [embed] };
}

export function shouldSendUsageMessage(
  previousTotalUsage: number,
  nextTotalUsage: number,
  guild: DBGuildWithSettings,
): boolean {
  const allowance = guild.settings.logging.token_limit;
  const warningThreshold = allowance - TOKEN_WARNING_START;

  // Warn once when crossing into the final 100 tokens, including large messages.
  return (
    previousTotalUsage < warningThreshold && nextTotalUsage >= warningThreshold
  );
}

export function hasReachedUsageLimit(guild: DBGuildWithSettings): boolean {
  const allowance = guild.settings.logging.token_limit;
  const totalUsage = guild.settings.logging.token_total_usage;
  return totalUsage >= allowance;
}
