import type { Json } from "../types.ts";
import { getSupabaseAdmin } from "../client.ts";

export async function upsertCommandSettings(input: {
  guildId: string;
  commandName: string;
  enabled?: boolean;
  settings?: Json;
  updatedByUserId?: string;
}): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;

  const { error } = await supabase.from("guild_command_settings").upsert(
    {
      guild_id: input.guildId,
      command_name: input.commandName,
      enabled: input.enabled ?? true,
      settings: input.settings ?? {},
      updated_by_user_id: input.updatedByUserId ?? null,
    },
    { onConflict: "guild_id,command_name" },
  );

  if (error) throw error;
}

export async function getCommandSettings(
  guildId: string,
  commandName: string,
) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return undefined;

  const { data, error } = await supabase
    .from("guild_command_settings")
    .select("*")
    .eq("guild_id", guildId)
    .eq("command_name", commandName)
    .maybeSingle();

  if (error) throw error;
  return data;
}
