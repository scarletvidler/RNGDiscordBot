import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type Message,
  type MessageCreateOptions,
} from "discord.js";
import type { DBGuildWithSettings } from "../../../supabase/models/guilds.ts";
import {
  getDiscordUser,
  updateDiscordUserLastVoted,
  upsertDiscordUser,
  type DBDiscordUser,
} from "../../../supabase/models/users.ts";
import { getTopGgApi } from "../topGg.ts";

export const NEW_USER_GRACE_PERIOD_MS = 2 * 60 * 60 * 1_000;
export const VOTE_VALIDITY_PERIOD_MS = 7 * 24 * 60 * 60 * 1_000;

type CachedGuildUser = DBGuildWithSettings["users"][number];

export function isGuildExemptFromVoting(
  guild: Pick<DBGuildWithSettings, "has_active_subscription">,
): boolean {
  return guild.has_active_subscription;
}

export function isVoteRequired(
  user: Pick<DBDiscordUser, "first_seen_at" | "last_voted">,
  now = Date.now(),
): boolean {
  if (user.last_voted) {
    return now - new Date(user.last_voted).getTime() > VOTE_VALIDITY_PERIOD_MS;
  }

  return now - new Date(user.first_seen_at).getTime() > NEW_USER_GRACE_PERIOD_MS;
}

async function fetchOrCreateDiscordUser(
  message: Message<true>,
): Promise<DBDiscordUser> {
  let databaseUser = await getDiscordUser(message.author.id);

  if (!databaseUser) {
    await upsertDiscordUser(message.author);
    databaseUser = await getDiscordUser(message.author.id);
  }

  if (!databaseUser) {
    throw new Error(`Failed to load Discord user ${message.author.id}`);
  }

  return databaseUser;
}

export async function getOrCacheGuildUser(
  message: Message<true>,
  guild: DBGuildWithSettings,
): Promise<CachedGuildUser> {
  const cachedUser = guild.users.find((user) => user.id === message.author.id);
  if (cachedUser?.databaseUser) return cachedUser;

  const databaseUser = await fetchOrCreateDiscordUser(message);
  if (cachedUser) {
    cachedUser.databaseUser = databaseUser;
    return cachedUser;
  }

  const newCachedUser: CachedGuildUser = {
    id: message.author.id,
    voice: null,
    databaseUser,
  };
  guild.users.push(newCachedUser);
  return newCachedUser;
}

async function refreshCachedDatabaseUser(
  cachedUser: CachedGuildUser,
): Promise<DBDiscordUser> {
  const databaseUser = await getDiscordUser(cachedUser.id);
  if (!databaseUser) {
    throw new Error(`Discord user ${cachedUser.id} disappeared from the database`);
  }

  cachedUser.databaseUser = databaseUser;
  return databaseUser;
}

export async function canUseTtsAfterVoteCheck(
  message: Message<true>,
  guild: DBGuildWithSettings,
): Promise<boolean> {
  const cachedUser = await getOrCacheGuildUser(message, guild);
  if (isGuildExemptFromVoting(guild)) return true;

  let databaseUser = cachedUser.databaseUser!;

  if (!isVoteRequired(databaseUser)) return true;

  // A vote is global to the user, while the cache is per guild. Refresh the
  // row before calling Top.gg so a vote recorded in another guild is honored.
  databaseUser = await refreshCachedDatabaseUser(cachedUser);
  if (!isVoteRequired(databaseUser)) return true;

  const topGgApi = getTopGgApi();
  if (!topGgApi) {
    throw new Error("TOPGG_TOKEN is required to verify TTS votes");
  }

  const activeVote = await topGgApi.getVote(message.author.id);
  if (!activeVote) return false;

  cachedUser.databaseUser = await updateDiscordUserLastVoted(
    message.author.id,
    activeVote.votedAt.toISOString(),
  );
  return true;
}

export function voteRequiredMessage(botId: string): MessageCreateOptions {
  const embed = new EmbedBuilder()
    .setColor(0xffb347)
    .setTitle("Support Lerche by voting")
    .setDescription(
      [
        "Your weekly vote is due before you can use TTS again.",
        "",
        "Voting is free and helps more people discover Lerche. After voting, send your TTS message again and Lerche will verify it automatically.",
      ].join("\n"),
    );

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setLabel("Vote for Lerche")
      .setStyle(ButtonStyle.Link)
      .setURL(`https://top.gg/bot/${botId}/vote`),
  );

  return { embeds: [embed], components: [row] };
}
