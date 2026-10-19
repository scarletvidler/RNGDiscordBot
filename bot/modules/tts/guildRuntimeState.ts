import {
  DBGetGuildRuntimeState,
  type DBGuildRuntimeState,
  type DBGuildWithSettings,
} from "../../../supabase/models/guilds.ts";

export const GUILD_RUNTIME_CACHE_TTL_MS = 60 * 1_000;

type RuntimeRefresh = {
  refreshedAt: number;
  inFlight?: Promise<void>;
};

type RuntimeStateFetcher = (
  guildId: string,
) => Promise<DBGuildRuntimeState | null>;

const runtimeRefreshes = new Map<string, RuntimeRefresh>();

export async function refreshGuildRuntimeState(
  guild: DBGuildWithSettings,
  now = Date.now(),
  fetchRuntimeState: RuntimeStateFetcher = DBGetGuildRuntimeState,
): Promise<void> {
  const refresh = runtimeRefreshes.get(guild.id) ?? { refreshedAt: 0 };
  runtimeRefreshes.set(guild.id, refresh);

  if (now - refresh.refreshedAt < GUILD_RUNTIME_CACHE_TTL_MS) return;
  if (refresh.inFlight) return refresh.inFlight;

  refresh.inFlight = (async () => {
    const databaseGuild = await fetchRuntimeState(guild.id);
    if (!databaseGuild) {
      throw new Error(`Guild ${guild.id} not found in database`);
    }

    guild.has_active_subscription = databaseGuild.has_active_subscription;
    guild.settings.logging.token_limit = databaseGuild.token_limit;
    guild.settings.logging.token_total_usage =
      databaseGuild.token_total_usage;
    guild.settings.logging.token_balance = Math.max(
      databaseGuild.token_limit - databaseGuild.token_total_usage,
      0,
    );
    refresh.refreshedAt = now;
  })().finally(() => {
    refresh.inFlight = undefined;
  });

  return refresh.inFlight;
}
