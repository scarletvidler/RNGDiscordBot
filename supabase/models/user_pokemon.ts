import { getSupabaseAdmin } from "../client.ts";
import { Tables, TablesInsert, TablesUpdate } from "../../supabase/types.ts";

export type DBUserPokemon = Tables<"user_pokemon">;
export type DBGuildMember = Tables<"guild_members">;

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

export async function DBGetUserPokemon(
  userId: string,
  guildId: string,
): Promise<DBUserPokemon[]> {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) throw new Error("Supabase client not initialized");

    const { data, error } = await supabase
      .from("user_pokemon")
      .select()
      .eq("user_id", userId)
      .eq("guild_id", guildId);
    if (error) throw error;
    return data;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(errorMessage);
  }
}

export async function DBGetGuildMember(
  userId: string,
  guildId: string,
): Promise<DBGuildMember | null> {
  return null as unknown as DBGuildMember; // TODO: Implement this
}
