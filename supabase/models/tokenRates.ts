import { getSupabaseAdmin } from "../client.ts";

export interface TokenRate {
  provider: "elevenlabs" | "fish";
  model: string;
  unit: "provider_credits" | "utf8_bytes";
  tokens_numerator: number;
  tokens_denominator: number;
  estimate_units_per_character: number;
}

export async function getTokenRate(
  provider: TokenRate["provider"],
  model: string,
): Promise<TokenRate> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase client not initialized");

  const { data, error } = await supabase
    .rpc("monetization_get_token_rate", {
      provider_name: provider,
      model_name: model,
    })
    .abortSignal(AbortSignal.timeout(12_000));

  if (error) throw error;
  if (!data) throw new Error("Token conversion rate is not configured");
  return data as unknown as TokenRate;
}
