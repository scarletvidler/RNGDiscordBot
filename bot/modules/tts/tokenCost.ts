import {
  getTokenRate,
  type TokenRate,
} from "../../../supabase/models/tokenRates.ts";
import { TTS_MODELS } from "../../config/defaults.ts";
import { TTSModels } from "../../types.ts";

const RATE_CACHE_TTL_MS = 60 * 1_000;
const rates = new Map<string, { rate: TokenRate; expiresAt: number }>();
const pendingRates = new Map<string, Promise<TokenRate>>();

export async function getModelTokenRate(model: TTSModels): Promise<TokenRate> {
  const provider = TTS_MODELS[model].provider;
  const providerModel = provider === "fish" ? "s2.1-pro" : model;
  const key = `${provider}:${providerModel}`;
  const cached = rates.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.rate;

  let pending = pendingRates.get(key);
  if (!pending) {
    pending = fetchRate(provider, providerModel, key);
    pendingRates.set(key, pending);
  }
  return pending;
}

async function fetchRate(
  provider: TokenRate["provider"],
  model: string,
  key: string,
): Promise<TokenRate> {
  try {
    const rate = await getTokenRate(provider, model);
    validateRate(rate);
    if (rate.provider !== provider || rate.model !== model) {
      throw new Error("Token conversion rate does not match the model");
    }
    rates.set(key, { rate, expiresAt: Date.now() + RATE_CACHE_TTL_MS });
    return rate;
  } finally {
    pendingRates.delete(key);
  }
}

function validateRate(rate: TokenRate): void {
  if (
    !Number.isSafeInteger(rate.tokens_numerator) ||
    rate.tokens_numerator <= 0 ||
    !Number.isSafeInteger(rate.tokens_denominator) ||
    rate.tokens_denominator <= 0 ||
    !Number.isFinite(rate.estimate_units_per_character) ||
    rate.estimate_units_per_character <= 0 ||
    (rate.provider === "fish" && rate.unit !== "utf8_bytes") ||
    (rate.provider === "elevenlabs" && rate.unit !== "provider_credits")
  ) {
    throw new Error("Invalid token conversion rate");
  }
}

export function tokensForUnits(units: number, rate: TokenRate): number {
  validateRate(rate);
  if (!Number.isFinite(units) || units < 0) {
    throw new Error("Invalid provider usage");
  }

  const tokens = Math.ceil(
    (units * rate.tokens_numerator) / rate.tokens_denominator,
  );
  if (!Number.isSafeInteger(tokens) || tokens > 2_147_483_647) {
    throw new Error("Token usage exceeds the supported limit");
  }
  return tokens;
}

export function estimateTokens(text: string, rate: TokenRate): number {
  const units =
    rate.unit === "utf8_bytes"
      ? Buffer.byteLength(text, "utf8")
      : text.length * rate.estimate_units_per_character;
  return tokensForUnits(units, rate);
}

export function getActualTokens(
  text: string,
  headers: Pick<Headers, "get">,
  rate: TokenRate,
): number {
  if (rate.unit === "utf8_bytes") return estimateTokens(text, rate);

  const reported = headers.get("character-cost");
  if (reported !== null && reported.trim() !== "") {
    const units = Number(reported);
    if (Number.isFinite(units) && units >= 0)
      return tokensForUnits(units, rate);
  }

  // A successful generation with missing metadata must never become free usage.
  console.warn(
    "[tts] Provider usage metadata missing; charging the saved estimate",
  );
  return estimateTokens(text, rate);
}
