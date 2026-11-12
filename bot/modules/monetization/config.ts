export interface MonetizationConfig {
  reconcileMs: number;
}

export function isSnowflake(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[1-9]\d{0,19}$/.test(value) &&
    BigInt(value) <= 18_446_744_073_709_551_615n
  );
}

export function readMonetizationConfig(
  env: NodeJS.ProcessEnv = process.env,
): MonetizationConfig {
  const minutes = Number(env.DISCORD_MONETIZATION_RECONCILE_MINUTES ?? "60");
  if (!Number.isInteger(minutes) || minutes < 5 || minutes > 1440) {
    throw new Error("Monetization reconciliation must be 5 to 1440 minutes");
  }
  return { reconcileMs: minutes * 60_000 };
}
