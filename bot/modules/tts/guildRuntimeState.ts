import {
  type DBGuildRuntimeState,
  type DBGuildWithSettings,
} from "../../../supabase/models/guilds.ts";
import { getGuildTokenState } from "../../../supabase/models/guildTokens.ts";

export const GUILD_RUNTIME_CACHE_TTL_MS = 60 * 1_000;

type RuntimeRefresh = {
  refreshedAt: number;
  inFlight?: Promise<void>;
};

type RuntimeStateFetcher = (
  guildId: string,
) => Promise<(DBGuildRuntimeState & { reserved_tokens?: number }) | null>;

const runtimeRefreshes = new Map<string, RuntimeRefresh>();

export function invalidateGuildRuntimeState(guildId: string): void {
  runtimeRefreshes.delete(guildId);
}

export function applyGuildTokenState(
  guild: DBGuildWithSettings,
  state: DBGuildRuntimeState & { reserved_tokens?: number },
): void {
  invalidateGuildRuntimeState(guild.id);
  updateGuildTokenState(guild, state);
}

function updateGuildTokenState(
  guild: DBGuildWithSettings,
  state: DBGuildRuntimeState & { reserved_tokens?: number },
): void {
  guild.has_active_subscription = state.has_active_subscription;
  guild.settings.logging.token_limit = state.token_limit;
  guild.settings.logging.token_total_usage = state.token_total_usage;
  guild.settings.logging.token_balance = Math.max(
    state.token_limit - state.token_total_usage - (state.reserved_tokens ?? 0),
    0,
  );
}

export async function refreshGuildRuntimeState(
  guild: DBGuildWithSettings,
  now = Date.now(),
  fetchRuntimeState: RuntimeStateFetcher = getGuildTokenState,
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

    // A purchase may have invalidated this read while it was in flight.
    if (runtimeRefreshes.get(guild.id) !== refresh) return;

    updateGuildTokenState(guild, databaseGuild);
    refresh.refreshedAt = now;
  })().finally(() => {
    refresh.inFlight = undefined;
  });

  return refresh.inFlight;
}
