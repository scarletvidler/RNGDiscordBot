import type { Guild } from "discord.js";
import { getSupabaseAdmin } from "../client.ts";
import { DBGuild, DBGuildTtsSettings } from "../types/guild.ts";

/*
  Creates or updates a guild record in the database. If the guild already exists, it will update the existing record with the new information. If it does not exist, it will create a new record.
*/
export async function upsertGuild(
  guild: Guild,
  rows: Partial<DBGuild> = {},
  onConflictRows: (keyof DBGuild)[] = [],
  ignoreDuplicates: boolean = false,
): Promise<DBGuild> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase client not initialized");
  onConflictRows = ["id", ...onConflictRows];
  const { data, error } = await supabase
    .from("guilds")
    .upsert(
      {
        id: guild.id,
        guild_name: guild.name,
        ...rows,
      },
      {
        onConflict: onConflictRows.join(","),
        ignoreDuplicates,
      },
    )
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function ensureGuildTtsSettings(
  guildId: string,
  defaults: DBGuildTtsSettings,
): Promise<DBGuildTtsSettings> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase client not initialized");

  const { data: existing, error: readError } = await supabase
    .from("guild_tts_settings")
    .select()
    .eq("guild_id", guildId)
    .maybeSingle();

  if (readError) throw readError;
  if (existing) return fromRow(existing);

  const { data: inserted, error: insertError } = await supabase
    .from("guild_tts_settings")
    .insert(toRow(guildId, defaults))
    .select()
    .single();

  if (insertError) throw insertError;
  return fromRow(inserted);
}

export async function saveGuildTtsSettings(
  guildId: string,
  settings: DBGuildTtsSettings,
): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;

  const { error } = await supabase
    .from("guild_tts_settings")
    .upsert(toRow(guildId, settings), { onConflict: "guild_id" });

  if (error) throw error;
}

export async function toggleGuildRoomPrefixMode(
  guildId: string,
  currentSettings: DBGuildTtsSettings,
): Promise<boolean> {
  const nextValue = !currentSettings.roomPrefixEnabled;
  await saveGuildTtsSettings(guildId, {
    ...currentSettings,
    roomPrefixEnabled: nextValue,
  });
  return nextValue;
}

export async function saveGuildSettings(
  guildId: string,
  rows: Partial<DBGuild>,
): Promise<DBGuild> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase client not initialized");
  // Update the guild settings and return the updated row
  const { data, error } = await supabase
    .from("guilds")
    .update(rows)
    .eq("id", guildId)
    .select()
    .single();
  if (error) throw error;

  return data;
}

function toRow(guildId: string, settings: DBGuildTtsSettings) {
  return {
    guild_id: guildId,
    replies_enabled: settings.repliesEnabled,
    room_prefix_enabled: settings.roomPrefixEnabled,
    tts_channel_name: settings.ttsChannelName,
    female_voice_id: settings.femaleVoiceId ?? null,
    male_voice_id: settings.maleVoiceId ?? null,
    idle_timeout_seconds: settings.idleTimeout,
  };
}

function fromRow(row: {
  replies_enabled: boolean;
  room_prefix_enabled: boolean;
  tts_channel_name: string;
  female_voice_id: string | null;
  male_voice_id: string | null;
  idle_timeout_seconds: number;
}): DBGuildTtsSettings {
  return {
    repliesEnabled: row.replies_enabled,
    roomPrefixEnabled: row.room_prefix_enabled,
    ttsChannelName: row.tts_channel_name,
    femaleVoiceId: row.female_voice_id ?? "",
    maleVoiceId: row.male_voice_id ?? "",
    idleTimeout: row.idle_timeout_seconds,
  };
}
