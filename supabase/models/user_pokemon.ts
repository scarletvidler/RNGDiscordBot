import { getSupabaseAdmin } from "../client.ts";
import { Tables, TablesInsert, TablesUpdate } from "../../supabase/types.ts";

export type DBUserPokemon = Tables<"user_pokemon">;

type DBUpsertUserPokemon = {
  rows: TablesInsert<"user_pokemon"> & Required<Pick<DBUserPokemon, "id">>;
  onConflictColumn?: string;
  ignoreDuplicates?: boolean;
};

export async function DBinsertUserPokemon(
  input: DBUpsertUserPokemon,
): Promise<DBUserPokemon> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase client not initialized");
  // Update the guild settings and return the updated row
  const { data, error } = await supabase
    .from("user_pokemon")
    .insert(input.rows)
    .eq("id", input.rows.id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export const DBGetUserPokemon = async (
  discordUserId: string,
  username: string,
  id: string,
  name: string,
): Promise<{ data: Tables<"guild_members"> | null; error: any }> => {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) throw new Error("Supabase client not initialized");

    const { data: user } = await supabase
      .from("discord_users")
      .upsert(
        { id: discordUserId, username: username },
        { onConflict: "discord_id" },
      )
      .select("id")
      .single()
      .throwOnError();

    const { data: server } = await supabase
      .from("guilds")
      .upsert({ id, name }, { onConflict: "id" })
      .select("id")
      .single()
      .throwOnError();

    const { data: profile } = await supabase
      .from("guild_members")
      .upsert(
        { user_id: user.id, guild_id: server.id },
        { onConflict: "user_id, server_id" },
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
