import { EmbedBuilder, type MessageCreateOptions } from "discord.js";
import { DBGuild, DBGuildWithSettings } from "../../supabase/models/guilds.ts";

export const TOKEN_WARNING_START = 2000;
export const TOKEN_WARNING_INTERVAL = 1000;
const SUPPORT_GIF_URL = "https://c.tenor.com/Q70pTPV9w6YAAAAC/tenor.gif";

export function usageMessage(
  totalUsage: number,
  guild: DBGuildWithSettings,
): MessageCreateOptions {
  const allowance = guild.settings.logging.tokenLimit;
  const remainingTokens = Math.max(allowance - totalUsage, 0);
  const embed = new EmbedBuilder()
    .setColor(0xffb347)
    .setTitle("Lerche Usage Notice")
    .setDescription(
      `**🛑 Please note the following:**
- Lerche will stop processing TTS once **${allowance.toLocaleString()} total tokens** have been used.
- The bot is still in early development, and all costs are currently coming directly from my bank account.
- I simply cannot cover these costs alone, so a **small Patreon subscription for power users** will be introduced soon.
- I am sorry about this, and I do plan to add other ways to help when I can.

**‼️ Please note:**
This message was introduced on **15 July 2026**. Any usage before that date will **not** be counted toward the total, because I do not think that would be fair.

If you really love the bot and want to keep using her, please reach out to me on Discord at **o._rosie_.o**. I have a Buy Me a Coffee link and can provide a temporary token allowance. (just the amount it costs me)`,
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
  const totalUsage = guild.settings.logging.tokenTotalUsage;
  const allowance = guild.settings.logging.tokenLimit;
  const embed = new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle("Lerche TTS Paused")
    .setDescription(
      [
        `Lerche has reached the mandatory **${allowance.toLocaleString()} token limit** and must stop processing TTS messages.`,
        "",
        "The bot is still in early development, and all current running costs are coming directly from my bank account.",
        "I simply cannot cover these costs alone, so a **small Patreon subscription for power users** will be introduced soon.",
        "",
        "If you really love the bot and want to keep using her, please reach out to me on Discord at `o._rosie_.o`.",
        "I have a Buy Me a Coffee link and can provide a temporary token allowance.",
        "",
        "I am sorry about this, and I do plan to add other ways to help when I can.",
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
  const allowance = guild.settings.logging.tokenLimit;
  const warningThreshold = allowance - TOKEN_WARNING_START;

  // Do not send anything until usage has reached the first warning point.
  if (nextTotalUsage < warningThreshold) {
    return false;
  }

  // Turn raw token totals into 1000-token buckets:
  // 2000-2999 => 2, 3000-3999 => 3, and so on.
  const previousThreshold = Math.floor(
    previousTotalUsage / TOKEN_WARNING_INTERVAL,
  );
  const nextThreshold = Math.floor(nextTotalUsage / TOKEN_WARNING_INTERVAL);

  // Send a warning only when usage crosses into the next bucket.
  return nextThreshold > previousThreshold;
}

export function hasReachedUsageLimit(guild: DBGuildWithSettings): boolean {
  const allowance = guild.settings.logging.tokenLimit;
  const totalUsage = guild.settings.logging.tokenTotalUsage;
  return totalUsage >= allowance;
}
