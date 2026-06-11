import { supabase } from "../supabase/client.ts";
import { Tables } from "../database.types.ts";

export const getUserProfile = async (
  discordUserId: string,
  username: string | null,
  discordServerId: string,
  serverName: string | null,
): Promise<{ data: Tables<"profiles"> | null; error: any }> => {
  try {
    const { data: user } = await supabase
      .from("users")
      .upsert(
        { discord_id: discordUserId, username: username },
        { onConflict: "discord_id" },
      )
      .select("id")
      .single()
      .throwOnError();

    const { data: server } = await supabase
      .from("servers")
      .upsert(
        { discord_server_id: discordServerId, server_name: serverName },
        { onConflict: "discord_server_id" },
      )
      .select("id")
      .single()
      .throwOnError();

    const { data: profile } = await supabase
      .from("profiles")
      .upsert(
        { user_id: user.id, server_id: server.id },
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
