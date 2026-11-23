import { getSupabaseAdmin } from "../client.ts";

export interface GuildTokenState {
  id: string;
  token_limit: number;
  token_total_usage: number;
  token_balance: number;
  has_active_subscription: boolean;
  managed_plan: boolean;
  legacy_features: boolean;
  reserved_tokens: number;
}

export interface GuildTokenOperation {
  created: boolean;
  status: "reserved" | "settled" | "released";
  quantity: number;
  state: GuildTokenState;
}

export async function getGuildTokenState(
  guildId: string,
): Promise<GuildTokenState | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase client not initialized");

  const { data, error } = await supabase
    .rpc("monetization_get_guild_token_state", { guild: guildId })
    .abortSignal(AbortSignal.timeout(12_000));

  if (error) throw error;
  return data as unknown as GuildTokenState | null;
}

export async function reserveGuildTokens(
  guildId: string,
  operationId: string,
  quantity: number,
): Promise<GuildTokenOperation> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase client not initialized");

  const { data, error } = await supabase
    .rpc("monetization_reserve_guild_tokens", {
      guild: guildId,
      operation: operationId,
      quantity,
    })
    .abortSignal(AbortSignal.timeout(12_000));

  if (error) throw error;
  return data as unknown as GuildTokenOperation;
}

export async function settleGuildTokens(
  guildId: string,
  operationId: string,
  quantity: number,
): Promise<GuildTokenOperation> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase client not initialized");

  const { data, error } = await supabase
    .rpc("monetization_settle_guild_tokens", {
      guild: guildId,
      operation: operationId,
      quantity,
    })
    .abortSignal(AbortSignal.timeout(12_000));

  if (error) throw error;
  return data as unknown as GuildTokenOperation;
}

export async function releaseGuildTokens(
  guildId: string,
  operationId: string,
): Promise<GuildTokenOperation> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase client not initialized");

  const { data, error } = await supabase
    .rpc("monetization_release_guild_tokens", {
      guild: guildId,
      operation: operationId,
    })
    .abortSignal(AbortSignal.timeout(12_000));

  if (error) throw error;
  return data as unknown as GuildTokenOperation;
}
