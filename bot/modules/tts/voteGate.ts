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

export const NEW_USER_GRACE_PERIOD_MS = 1 * 24 * 60 * 60 * 1_000;
export const VOTE_VALIDITY_PERIOD_MS = 7 * 24 * 60 * 60 * 1_000;
export const USER_DATABASE_CACHE_TTL_MS = 60 * 1_000;

type CachedGuildUser = DBGuildWithSettings["users"][number];
const databaseUserLoads = new Map<string, Promise<DBDiscordUser>>();
const voteChecks = new Map<string, Promise<DBDiscordUser | null>>();

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

  return (
    now - new Date(user.first_seen_at).getTime() > NEW_USER_GRACE_PERIOD_MS
  );
}

async function fetchOrCreateDiscordUser(
  message: Message<true>,
): Promise<DBDiscordUser> {
  const userId = message.author.id;
  const inFlightLoad = databaseUserLoads.get(userId);
  if (inFlightLoad) return inFlightLoad;

  const load = (async () => {
    let databaseUser = await getDiscordUser(userId);

    if (!databaseUser) {
      await upsertDiscordUser(message.author);
      databaseUser = await getDiscordUser(userId);
    }

    if (!databaseUser) {
      throw new Error(`Failed to load Discord user ${userId}`);
    }

    return databaseUser;
  })().finally(() => {
    databaseUserLoads.delete(userId);
  });

  databaseUserLoads.set(userId, load);
  return load;
}

export async function getOrCacheGuildUser(
  message: Message<true>,
  guild: DBGuildWithSettings,
): Promise<CachedGuildUser> {
  const cachedUser = guild.users.find((user) => user.id === message.author.id);
  if (cachedUser?.databaseUser) return cachedUser;

  const databaseUser = await fetchOrCreateDiscordUser(message);
  const currentCachedUser =
    cachedUser ?? guild.users.find((user) => user.id === message.author.id);
  if (currentCachedUser) {
    currentCachedUser.databaseUser = databaseUser;
    currentCachedUser.databaseUserCachedAt = Date.now();
    return currentCachedUser;
  }

  const newCachedUser: CachedGuildUser = {
    id: message.author.id,
    voice: null,
    voiceLoaded: false,
    databaseUser,
    databaseUserCachedAt: Date.now(),
  };
  guild.users.push(newCachedUser);
  return newCachedUser;
}

async function refreshCachedDatabaseUser(
  cachedUser: CachedGuildUser,
  now = Date.now(),
): Promise<DBDiscordUser> {
  if (
    cachedUser.databaseUser &&
    cachedUser.databaseUserCachedAt !== undefined &&
    now - cachedUser.databaseUserCachedAt < USER_DATABASE_CACHE_TTL_MS
  ) {
    return cachedUser.databaseUser;
  }

  const databaseUser = await getDiscordUser(cachedUser.id);
  if (!databaseUser) {
    throw new Error(
      `Discord user ${cachedUser.id} disappeared from the database`,
    );
  }

  cachedUser.databaseUser = databaseUser;
  cachedUser.databaseUserCachedAt = now;
  return databaseUser;
}

async function verifyActiveVote(userId: string): Promise<DBDiscordUser | null> {
  const inFlightCheck = voteChecks.get(userId);
  if (inFlightCheck) return inFlightCheck;

  const check = (async () => {
    const topGgApi = getTopGgApi();
    if (!topGgApi) {
      throw new Error("TOPGG_TOKEN is required to verify TTS votes");
    }

    const activeVote = await topGgApi.getVote(userId);
    if (!activeVote) return null;

    return updateDiscordUserLastVoted(userId, activeVote.votedAt.toISOString());
  })().finally(() => {
    voteChecks.delete(userId);
  });

  voteChecks.set(userId, check);
  return check;
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

  const verifiedUser = await verifyActiveVote(message.author.id);
  if (!verifiedUser) return false;

  cachedUser.databaseUser = verifiedUser;
  cachedUser.databaseUserCachedAt = Date.now();
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
