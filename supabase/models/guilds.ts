import type { APIGuild, Guild } from "discord.js";
import { getSupabaseAdmin } from "../client.ts";

export interface DBGuildTtsSettings {
  repliesEnabled: boolean;
  roomPrefixEnabled: boolean;
  ttsChannelName: string;
  femaleVoiceId: string;
  maleVoiceId: string;
  idleTimeout: number;
}

export interface DBGuildLogging {
  messageCount: number;
  tokenTotalUsage: number;
  tokenBalance: number;
  tokenLimit: number;
}
export interface DBGuild {
  id: string;
  name: string;
  owner_id: string;
  message_count: number;
  token_total_usage: number;
  token_balance: number;
  token_limit: number;
  joined_at: string;
  left_at: string | null;
  created_at: string;
  updated_at: string;
}

export type DBGuildWithSettings = DBGuild & {
  settings: {
    tts: DBGuildTtsSettings;
    logging: DBGuildLogging;
  };
};

type DBUpsertGuild = {
  rows: Partial<DBGuild> & { id: string; owner_id: string; name: string };
  onConflictColumn?: string;
  ignoreDuplicates?: boolean;
};

function setTTSRows(guildId: string, settings: DBGuildTtsSettings) {
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

function getTTSRows(row: {
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

export async function DBGetGuild(guildId: string): Promise<DBGuild | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase client not initialized");
  const { data, error } = await supabase
    .from("guilds")
    .select()
    .eq("id", guildId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/*
  Creates or updates a guild record in the database. If the guild already exists, it will update the existing record with the new information. If it does not exist, it will create a new record.
*/
export async function DBUpsertGuild(input: DBUpsertGuild): Promise<DBGuild> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase client not initialized");
  const { data, error } = await supabase
    .from("guilds")
    .upsert(input.rows, {
      onConflict: input.onConflictColumn,
      ignoreDuplicates: input.ignoreDuplicates,
    })
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
  if (existing) return getTTSRows(existing);

  const { data: inserted, error: insertError } = await supabase
    .from("guild_tts_settings")
    .insert(setTTSRows(guildId, defaults))
    .select()
    .single();

  if (insertError) throw insertError;
  return getTTSRows(inserted);
}

export async function saveGuildTTSSettings(
  guildId: string,
  settings: DBGuildTtsSettings,
): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;

  const { error } = await supabase
    .from("guild_tts_settings")
    .upsert(setTTSRows(guildId, settings), { onConflict: "guild_id" });

  if (error) throw error;
}

export async function toggleGuildRoomPrefixMode(
  guildId: string,
  currentSettings: DBGuildTtsSettings,
): Promise<boolean> {
  const nextValue = !currentSettings.roomPrefixEnabled;
  await saveGuildTTSSettings(guildId, {
    ...currentSettings,
    roomPrefixEnabled: nextValue,
  });
  return nextValue;
}

/*
  Saves the provided guild settings to the database. If the guild does not exist, it will create a new record. If it does exist, it will update the existing record with the new settings.
  @param guildId - The ID of the Discord guild to save settings for.
  @param rows - An object containing the settings to save for the guild.
  @returns A promise that resolves to the updated guild record from the database.
*/
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

/*
  Check if a guild exists in the database. If it does, return the guild record. If it does not, return null.
  @param guildId - The ID of the Discord guild to check in the database.
  @returns A promise that resolves to the existing guild record from the database, or null if it does not exist.
*/
export async function checkDBGuildExists(
  guildId: string,
): Promise<DBGuild | null> {
  const guild = await DBGetGuild(guildId);
  return guild;
}

/*
 Check if a guild exists in the database, if it does not exist, create it. If it does exist, return the existing guild.
 @param guild - The Discord guild object to check or create in the database.
 @returns A promise that resolves to the existing or newly created guild record from the database.
*/
export async function getOrCreateDBGuild(guild: Guild): Promise<DBGuild> {
  const existingDB = await checkDBGuildExists(guild.id);

  if (!existingDB) {
    const newDBGuild = await DBUpsertGuild({
      rows: {
        id: guild.id,
        name: guild.name,
        owner_id: guild.ownerId,
      },
    });
    return newDBGuild;
  }

  return existingDB;
}
