import type { ExtendedClient } from "../types.ts";
import { getTopGgApi } from "./topGg.ts";

const EVENT_UPDATE_DELAY_MS = 5_000;
const PERIODIC_UPDATE_INTERVAL_MS = 60 * 60 * 1_000;

let eventUpdateTimer: NodeJS.Timeout | undefined;
let periodicUpdateTimer: NodeJS.Timeout | undefined;
let reporterStarted = false;
let reportQueue: Promise<void> = Promise.resolve();

type TopGgStats = {
  serverCount: number;
  shardCount: number;
};

function isReporterProcess(client: ExtendedClient): boolean {
  return !client.shard || client.shard.ids.includes(0);
}

export async function getTopGgStats(
  client: ExtendedClient,
): Promise<TopGgStats> {
  if (!client.shard) {
    return {
      serverCount: client.guilds.cache.size,
      shardCount: Math.max(client.ws.shards.size, 1),
    };
  }

  const guildCounts = await client.shard.fetchClientValues(
    "guilds.cache.size",
  );

  if (
    guildCounts.length !== client.shard.count ||
    !guildCounts.every(
      (count) =>
        typeof count === "number" && Number.isInteger(count) && count >= 0,
    )
  ) {
    throw new Error(
      "Discord returned invalid guild counts for one or more shards",
    );
  }

  return {
    serverCount: (guildCounts as number[]).reduce(
      (total, count) => total + count,
      0,
    ),
    shardCount: client.shard.count,
  };
}

async function postTopGgStats(client: ExtendedClient): Promise<void> {
  const api = getTopGgApi();
  if (!api || !isReporterProcess(client)) return;

  const stats = await getTopGgStats(client);
  await api.postMetrics(stats);

  console.log(
    `[Top.gg] Reported ${stats.serverCount} servers across ${stats.shardCount} shard(s).`,
  );
}

function queueTopGgStatsUpdate(client: ExtendedClient): void {
  reportQueue = reportQueue
    .catch(() => undefined)
    .then(() => postTopGgStats(client))
    .catch((error: unknown) => {
      console.error("[Top.gg] Failed to report bot statistics:", error);
    });
}

export function scheduleTopGgStatsUpdate(client: ExtendedClient): void {
  if (!getTopGgApi() || !isReporterProcess(client)) return;

  if (eventUpdateTimer) clearTimeout(eventUpdateTimer);
  eventUpdateTimer = setTimeout(() => {
    eventUpdateTimer = undefined;
    queueTopGgStatsUpdate(client);
  }, EVENT_UPDATE_DELAY_MS);
  eventUpdateTimer.unref();
}

export function startTopGgStatsReporter(client: ExtendedClient): void {
  if (reporterStarted || !isReporterProcess(client)) return;
  reporterStarted = true;

  if (!getTopGgApi()) {
    console.warn(
      "[Top.gg] TOPGG_TOKEN is not configured; server-count reporting is disabled.",
    );
    return;
  }

  queueTopGgStatsUpdate(client);
  periodicUpdateTimer = setInterval(
    () => queueTopGgStatsUpdate(client),
    PERIODIC_UPDATE_INTERVAL_MS,
  );
  periodicUpdateTimer.unref();
}
