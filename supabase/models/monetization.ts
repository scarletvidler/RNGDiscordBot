import { getSupabaseAdmin } from "../client.ts";
import type { Json, Tables, TablesInsert } from "../types.ts";

export type DBDiscordSku = Tables<"discord_skus">;
export type DBDiscordEntitlement = Tables<"discord_entitlements">;
export type DBDiscordSubscription = Tables<"discord_subscriptions">;
export type DBTokenGrant = Tables<"token_grants">;

function requireSupabase() {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase client not initialized");
  return supabase;
}

export async function upsertDiscordSkus(
  skus: TablesInsert<"discord_skus">[],
): Promise<DBDiscordSku[]> {
  if (skus.length === 0) return [];
  const { data, error } = await requireSupabase()
    .from("discord_skus")
    .upsert(skus, { onConflict: "sku_id" })
    .select();
  if (error) throw error;
  return data;
}

export async function getActiveDiscordSkus(): Promise<DBDiscordSku[]> {
  const { data, error } = await requireSupabase()
    .from("discord_skus")
    .select()
    .eq("active", true)
    .order("tokens_per_period", { ascending: true });
  if (error) throw error;
  return data;
}

export async function getDiscordSku(
  skuId: string,
): Promise<DBDiscordSku | null> {
  const { data, error } = await requireSupabase()
    .from("discord_skus")
    .select()
    .eq("sku_id", skuId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function upsertDiscordEntitlement(
  entitlement: TablesInsert<"discord_entitlements">,
): Promise<DBDiscordEntitlement> {
  const { data, error } = await requireSupabase()
    .from("discord_entitlements")
    .upsert(entitlement, { onConflict: "id" })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getDiscordEntitlement(
  entitlementId: string,
): Promise<DBDiscordEntitlement | null> {
  const { data, error } = await requireSupabase()
    .from("discord_entitlements")
    .select()
    .eq("id", entitlementId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getDiscordSubscription(
  subscriptionId: string,
): Promise<DBDiscordSubscription | null> {
  const { data, error } = await requireSupabase()
    .from("discord_subscriptions")
    .select()
    .eq("id", subscriptionId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function upsertDiscordSubscription(input: {
  id: string;
  guild_id: string;
  purchaser_user_id: string;
  sku_id: string;
  entitlement_id: string | null;
  status: number;
  current_period_start: string;
  current_period_end: string;
  canceled_at: string | null;
  renewal_sku_ids: Json | null;
}): Promise<DBDiscordSubscription> {
  const { data, error } = await requireSupabase()
    .from("discord_subscriptions")
    .upsert(input, { onConflict: "id" })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function grantDiscordTokens(input: {
  guildId: string;
  source:
    | "discord_subscription"
    | "discord_test_entitlement"
    | "discord_consumable";
  sourceKey: string;
  amount: number;
  subscriptionId?: string | null;
  entitlementId?: string | null;
  skuId?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
}): Promise<boolean> {
  const { data, error } = await requireSupabase().rpc(
    "grant_discord_tokens",
    {
      p_guild_id: input.guildId,
      p_source: input.source,
      p_source_key: input.sourceKey,
      p_amount: input.amount,
      p_subscription_id: input.subscriptionId,
      p_entitlement_id: input.entitlementId,
      p_sku_id: input.skuId,
      p_period_start: input.periodStart,
      p_period_end: input.periodEnd,
    },
  );
  if (error) throw error;
  return data;
}

export async function getGuildPremiumState(guildId: string): Promise<{
  entitlement: DBDiscordEntitlement | null;
  subscription: DBDiscordSubscription | null;
  sku: DBDiscordSku | null;
  latestGrant: DBTokenGrant | null;
}> {
  const supabase = requireSupabase();
  const now = new Date().toISOString();

  const [entitlementsResult, subscriptionResult, grantResult] =
    await Promise.all([
      supabase
        .from("discord_entitlements")
        .select()
        .eq("guild_id", guildId)
        .eq("deleted", false)
        .order("updated_at", { ascending: false }),
      supabase
        .from("discord_subscriptions")
        .select()
        .eq("guild_id", guildId)
        .order("current_period_end", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("token_grants")
        .select()
        .eq("guild_id", guildId)
        .in("source", ["discord_subscription", "discord_test_entitlement"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  if (entitlementsResult.error) throw entitlementsResult.error;
  if (subscriptionResult.error) throw subscriptionResult.error;
  if (grantResult.error) throw grantResult.error;

  const entitlement =
    entitlementsResult.data.find(
      (item) => item.ends_at === null || item.ends_at > now,
    ) ?? null;
  const subscription = subscriptionResult.data;
  const skuId = entitlement?.sku_id ?? subscription?.sku_id;
  const sku = skuId ? await getDiscordSku(skuId) : null;

  return {
    entitlement,
    subscription,
    sku,
    latestGrant: grantResult.data,
  };
}
