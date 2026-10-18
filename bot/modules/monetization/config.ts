import { upsertDiscordSkus } from "../../../supabase/models/monetization.ts";

export type DiscordPremiumSkuConfig = {
  skuId: string;
  name: string;
  tokens: number;
};

export function parseDiscordPremiumSkus(
  raw: string | undefined,
): DiscordPremiumSkuConfig[] {
  if (!raw?.trim()) return [];

  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error("DISCORD_PREMIUM_SKUS must be a JSON array");
  }
  if (parsed.length > 25) {
    throw new Error(
      "DISCORD_PREMIUM_SKUS supports at most 25 plans in the /premium response",
    );
  }

  const configured = parsed.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new Error(`DISCORD_PREMIUM_SKUS[${index}] must be an object`);
    }

    const candidate = item as Record<string, unknown>;
    const skuId = candidate.skuId;
    const name = candidate.name;
    const tokens = candidate.tokens;

    if (typeof skuId !== "string" || !/^\d+$/.test(skuId)) {
      throw new Error(
        `DISCORD_PREMIUM_SKUS[${index}].skuId must be a Discord snowflake`,
      );
    }
    if (typeof name !== "string" || name.trim().length === 0) {
      throw new Error(
        `DISCORD_PREMIUM_SKUS[${index}].name must be a non-empty string`,
      );
    }
    if (
      typeof tokens !== "number" ||
      !Number.isSafeInteger(tokens) ||
      tokens <= 0
    ) {
      throw new Error(
        `DISCORD_PREMIUM_SKUS[${index}].tokens must be a positive integer`,
      );
    }

    return { skuId, name: name.trim(), tokens };
  });

  if (new Set(configured.map((sku) => sku.skuId)).size !== configured.length) {
    throw new Error("DISCORD_PREMIUM_SKUS contains a duplicate skuId");
  }

  return configured;
}

export async function syncDiscordPremiumSkuConfig(): Promise<number> {
  const configured = parseDiscordPremiumSkus(
    process.env.DISCORD_PREMIUM_SKUS,
  );
  if (configured.length === 0) return 0;

  await upsertDiscordSkus(
    configured.map((sku) => ({
      sku_id: sku.skuId,
      name: sku.name,
      tokens_per_period: sku.tokens,
      active: true,
    })),
  );
  return configured.length;
}
