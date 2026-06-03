import { supabase } from "./client";

export const getUserProfile = async (discordUserId, discordServerId) => {
  const { data: user, error: userError } = await supabase
    .from("users")
    .upsert({ discord_id: discordUserId }, { onConflict: "discord_id" })
    .select("id")
    .single();

  if (userError || !user) return { data: null, error: userError };

  const { data: server, error: serverError } = await supabase
    .from("servers")
    .upsert(
      { discord_server_id: discordServerId },
      { onConflict: "discord_server_id" },
    )
    .select("id")
    .single();

  if (serverError || !server) return { data: null, error: serverError };

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .upsert(
      { user_id: user.id, server_id: server.id },
      { onConflict: "user_id, server_id" },
    )
    .select("*")
    .single();
  if (profileError || !profile) return { data: null, error: profileError };

  return { data: profile, error: null };
};
