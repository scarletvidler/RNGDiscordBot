import type { Guild } from "discord.js";
import { getSupabaseAdmin } from "../client.ts";

export interface GuildTtsSettings {
  repliesEnabled: boolean;
  roomPrefixEnabled: boolean;
  ttsChannelName: string;
  femaleVoiceId: string;
  maleVoiceId: string;
  idleTimeout: number;
}

export async function upsertGuild(guild: Guild): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;

  const { error } = await supabase.from("guilds").upsert({
    id: guild.id,
    name: guild.name,
    owner_id: guild.ownerId ?? null,
    left_at: null,
  });

  if (error) throw error;
}

export async function ensureGuildTtsSettings(
  guildId: string,
  defaults: GuildTtsSettings,
): Promise<GuildTtsSettings> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return defaults;

  const { data, error } = await supabase
    .from("guild_tts_settings")
    .upsert(toRow(guildId, defaults), { onConflict: "guild_id" })
    .select()
    .single();

  if (error) throw error;
  return fromRow(data);
}

export async function saveGuildTtsSettings(
  guildId: string,
  settings: GuildTtsSettings,
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
  currentSettings: GuildTtsSettings,
): Promise<boolean> {
  const nextValue = !currentSettings.roomPrefixEnabled;
  await saveGuildTtsSettings(guildId, {
    ...currentSettings,
    roomPrefixEnabled: nextValue,
  });
  return nextValue;
}

function toRow(guildId: string, settings: GuildTtsSettings) {
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
}): GuildTtsSettings {
  return {
    repliesEnabled: row.replies_enabled,
    roomPrefixEnabled: row.room_prefix_enabled,
    ttsChannelName: row.tts_channel_name,
    femaleVoiceId: row.female_voice_id ?? "",
    maleVoiceId: row.male_voice_id ?? "",
    idleTimeout: row.idle_timeout_seconds,
  };
}
