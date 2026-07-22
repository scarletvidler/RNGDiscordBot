import { getSupabaseAdmin } from "../client.ts";

export interface PokemonProfile {
  id: string;
  created_at: string;
  discord_user_id: string;
  guild_id: string;
  last_rolled_at: string | null;
}

export const getUserProfile = async (
  discordUserId: string,
  username: string | null,
  discordServerId: string,
  serverName: string | null,
): Promise<{ data: PokemonProfile | null; error: any }> => {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) {
      return { data: null, error: "Supabase client not initialized" };
    }

    await supabase
      .from("discord_users")
      .upsert(
        {
          id: discordUserId,
          username: username ?? "Unknown User",
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      )
      .throwOnError();

    await supabase
      .from("guilds")
      .upsert(
        { id: discordServerId, name: serverName ?? "Unknown Server" },
        { onConflict: "id" },
      )
      .throwOnError();

    const { data: profile } = await supabase
      .from("pokemon_profiles")
      .upsert(
        { discord_user_id: discordUserId, guild_id: discordServerId },
        { onConflict: "discord_user_id,guild_id" },
      )
      .select("*")
      .single()
      .throwOnError();

    return { data: profile, error: null };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { data: null, error: errorMessage };
  }
};
