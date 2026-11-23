import { getGrantedFeatures } from "../../supabase/models/fulfillmentActions/getGrantedFeatures.ts";

export const GUILD_FEATURE_CACHE_TTL_MS = 60 * 1_000;

type FeatureCache = {
  features?: ReadonlySet<string>;
  expiresAt: number;
  inFlight?: Promise<ReadonlySet<string>>;
};

const guildFeatures = new Map<string, FeatureCache>();

function cacheKey(applicationId: string, guildId: string): string {
  return `${applicationId}:${guildId}`;
}

/** Clear access immediately, including any pending read from before the change. */
export function invalidateGuildFeatures(
  applicationId: string,
  guildId: string,
): void {
  guildFeatures.delete(cacheKey(applicationId, guildId));
}

/** Preload or read the guild cache; expired entries are never used on failure. */
export async function loadGuildFeatures(
  applicationId: string,
  guildId: string,
): Promise<ReadonlySet<string>> {
  if (!applicationId || !guildId) throw new Error("Missing feature scope");

  const key = cacheKey(applicationId, guildId);
  let entry = guildFeatures.get(key);
  if (entry?.features && entry.expiresAt > Date.now()) {
    return new Set(entry.features);
  }

  if (!entry) {
    entry = { expiresAt: 0 };
    guildFeatures.set(key, entry);
  }

  entry.inFlight ??= fetchGuildFeatures(applicationId, guildId, entry);
  return new Set(await entry.inFlight);
}

async function fetchGuildFeatures(
  applicationId: string,
  guildId: string,
  entry: FeatureCache,
): Promise<ReadonlySet<string>> {
  const key = cacheKey(applicationId, guildId);

  try {
    const features = await getGrantedFeatures(applicationId, {
      type: "guild",
      id: guildId,
    });

    // A grant/removal may invalidate this read while it is in flight.
    if (guildFeatures.get(key) !== entry) {
      return loadGuildFeatures(applicationId, guildId);
    }

    entry.features = new Set(features);
    entry.expiresAt = Date.now() + GUILD_FEATURE_CACHE_TTL_MS;
    return entry.features;
  } catch (error) {
    if (guildFeatures.get(key) !== entry) {
      return loadGuildFeatures(applicationId, guildId);
    }

    guildFeatures.delete(key);
    throw error;
  } finally {
    entry.inFlight = undefined;
  }
}

/** Refresh after a local change; other processes refresh on the bounded TTL. */
export function refreshGuildFeatures(
  applicationId: string,
  guildId: string,
): Promise<ReadonlySet<string>> {
  invalidateGuildFeatures(applicationId, guildId);
  return loadGuildFeatures(applicationId, guildId);
}

/** Checks one feature, or all supplied features, denying access on read failure. */
export async function guildHasFeature(
  applicationId: string,
  guildId: string,
  required: string | readonly string[],
): Promise<boolean> {
  try {
    const features = await loadGuildFeatures(applicationId, guildId);
    const names = typeof required === "string" ? [required] : required;
    return names.every((feature) => features.has(feature));
  } catch {
    return false;
  }
}
