import invariant from "tiny-invariant";
import { getSupabaseAdmin } from "../client.js";

export type VoiceOwnerType = "user" | "role";

interface DBVoiceBase {
  guild_id: string;
  owner_type: VoiceOwnerType;
  owner_id: string;
  created_at: string | undefined;
}

interface DBVoiceUpdatable {
  voice_id: string;
  voice_name: string;
  voice_provider: string;
}

type DBVoice = DBVoiceBase & DBVoiceUpdatable;

export type DBVoiceUser = DBVoice & Required<{ owner_type: "user" }>;
export type DBVoiceRole = DBVoice & Required<{ owner_type: "role" }>;
export type UpdateRoleVoice = Partial<DBVoiceUpdatable> &
  Required<{ owner_type: "role" }>;
export type UpdateUserVoice = Partial<DBVoiceUpdatable> &
  Required<{ owner_type: "user" }>;

export async function createVoice(voice: DBVoice): Promise<DBVoice> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase client not initialized");
  const { data, error } = await supabase
    .from("guild_voices")
    .upsert(voice, { onConflict: "guild_id,owner_type,owner_id" })
    .select()
    .maybeSingle();

  if (error) throw error;
  invariant(data != null, "Voice not created in database");
  return data;
}

export async function deleteVoice(voiceId: DBVoice["voice_id"]): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase client not initialized");
  const { error } = await supabase
    .from("guild_voices")
    .delete()
    .eq("voice_id", voiceId);
  if (error) throw error;
}

export async function updateVoice(
  voiceId: DBVoice["voice_id"],
  updates: UpdateUserVoice | UpdateRoleVoice,
): Promise<DBVoice> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase client not initialized");
  const { data, error } = await supabase
    .from("guild_voices")
    .update(updates)
    .eq("voice_id", voiceId)
    .select()
    .maybeSingle();
  if (error) throw error;
  invariant(data != null, "Voice not found after update");
  return data;
}

export async function getVoiceById(
  voiceId: DBVoice["voice_id"],
): Promise<DBVoice> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase client not initialized");
  const { data, error } = await supabase
    .from("guild_voices")
    .select()
    .eq("voice_id", voiceId)
    .maybeSingle();
  if (error) throw error;
  invariant(data != null, "Voice not found");
  return data;
}

export async function getGuildVoices(
  guildId: DBVoice["guild_id"],
): Promise<DBVoice[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase client not initialized");
  const { data, error } = await supabase
    .from("guild_voices")
    .select()
    .eq("guild_id", guildId);
  if (error) throw error;
  invariant(data != null, "Voices not found");
  return data;
}

export async function getUserVoice(
  guildId: DBVoice["guild_id"],
  userId: DBVoice["owner_id"],
): Promise<DBVoiceUser | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase client not initialized");
  const { data, error } = await supabase
    .from("guild_voices")
    .select()
    .eq("guild_id", guildId)
    .eq("owner_id", userId)
    .eq("owner_type", "user")
    .maybeSingle();
  if (error) throw error;

  return data as DBVoiceUser | null;
}

export async function getRoleVoices(
  roleId: DBVoice["owner_id"],
): Promise<DBVoiceRole[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase client not initialized");
  const { data, error } = await supabase
    .from("guild_voices")
    .select()
    .eq("owner_id", roleId)
    .eq("owner_type", "role");
  if (error) throw error;
  return data as DBVoiceRole[];
}

export async function getRolesVoices(
  guildId: DBVoice["guild_id"],
  roleIds: DBVoice["owner_id"][],
): Promise<DBVoiceRole[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase client not initialized");
  const { data, error } = await supabase
    .from("guild_voices")
    .select()
    .eq("guild_id", guildId)
    .in("owner_id", roleIds)
    .eq("owner_type", "role");
  if (error) throw error;
  invariant(data != null, "Roles voices not found");
  return data as DBVoiceRole[];
}
