export interface MonetizationConfig {
  skuIds: ReadonlySet<string>;
  reconcileMs: number;
}

export function isSnowflake(value: unknown): value is string {
  return typeof value === "string" && /^[1-9]\d{0,19}$/.test(value)
    && BigInt(value) <= 18_446_744_073_709_551_615n;
}

export function readMonetizationConfig(
  env: NodeJS.ProcessEnv = process.env,
): MonetizationConfig | null {
  if (env.DISCORD_MONETIZATION_ENABLED !== "true") return null;
  const ids = env.DISCORD_MONETIZATION_SKU_IDS?.split(",").map((id) => id.trim()) ?? [];
  if (!ids.length || ids.some((id) => !isSnowflake(id)) || ids.length > 100) {
    throw new Error("Monetization requires between 1 and 100 valid SKU IDs");
  }
  const minutes = Number(env.DISCORD_MONETIZATION_RECONCILE_MINUTES ?? "60");
  if (!Number.isInteger(minutes) || minutes < 5 || minutes > 1440) {
    throw new Error("Monetization reconciliation must be 5 to 1440 minutes");
  }
  if (!env.DISCORD_MONETIZATION_DATABASE_URL) {
    throw new Error("Monetization requires its restricted database connection");
  }
  return { skuIds: new Set(ids), reconcileMs: minutes * 60_000 };
}
