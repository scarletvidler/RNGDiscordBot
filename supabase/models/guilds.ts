import type { Guild } from "discord.js";
import { getSupabaseAdmin } from "../client.ts";
import { APIGetUserByGuild } from "../../bot/api/getUser.ts";
import invariant from "tiny-invariant";
import type { Tables, TablesInsert, TablesUpdate } from "../types.ts";

export type DBGuild = Tables<"guilds">;
export type DBGuildTtsSettings = Tables<"guild_tts_settings">;
export type DBGuildLogging = Tables<"guild_chat_logs">;

export type DBGuildWithSettings = DBGuild & {
  settings: {
    tts: DBGuildTtsSettings;
    logging: Pick<
      DBGuild,
      "message_count" | "token_total_usage" | "token_balance" | "token_limit"
    >;
  };
};

type DBUpdateGuild = {
  rows: TablesUpdate<"guilds"> & Required<Pick<DBGuild, "id">>;
  onConflictColumn?: string;
  ignoreDuplicates?: boolean;
};

type DBUpsertGuild = {
  rows: TablesInsert<"guilds"> & Required<Pick<DBGuild, "id">>;
  onConflictColumn?: string;
  ignoreDuplicates?: boolean;
};

type DBUpsertGuildTtsSettings = {
  rows: Required<Pick<DBGuildTtsSettings, "guild_id">> &
    Partial<Omit<DBGuildTtsSettings, "guild_id">>;
  onConflictColumn?: string;
  ignoreDuplicates?: boolean;
};

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

export async function DBGetGuildSetting<K extends keyof DBGuild>(
  guildId: string,
  setting: K,
): Promise<DBGuild[K] | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase client not initialized");
  const { data, error } = await supabase
    .from("guilds")
    .select(setting)
    .eq("id", guildId)
    .maybeSingle();

  if (error) throw error;
  return data ? (data as Pick<DBGuild, K>)[setting] : null;
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

export async function DBUpsertGuildTTSSettings(
  settings: DBUpsertGuildTtsSettings["rows"],
): Promise<DBGuildTtsSettings> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase client not initialized");

  const { data, error } = await supabase
    .from("guild_tts_settings")
    .upsert(settings, {
      onConflict: "guild_id",
      ignoreDuplicates: false,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function toggleGuildRoomPrefixMode(
  extendedGuild: DBGuildWithSettings,
): Promise<boolean> {
  const guild_id = extendedGuild.id;
  const currentValue = extendedGuild.settings.tts.room_prefix_enabled;
  const nextValue = !currentValue;

  console.log(
    `Toggling room prefix mode for guild ${guild_id} from ${currentValue} to ${nextValue}`,
  );

  const result = await DBUpsertGuildTTSSettings({
    guild_id,
    room_prefix_enabled: nextValue,
  });
  syncGuildTTSSettingsWithDB(result, extendedGuild);
  return nextValue;
}

export function syncGuildTTSSettingsWithDB(
  TTSsettings: DBGuildTtsSettings,
  extendedGuild: DBGuildWithSettings,
) {
  extendedGuild.settings.tts = TTSsettings;
}
/*
  Saves the provided guild settings to the database. If the guild does not exist, it will create a new record. If it does exist, it will update the existing record with the new settings.
  @param guildId - The ID of the Discord guild to save settings for.
  @param rows - An object containing the settings to save for the guild.
  @returns A promise that resolves to the updated guild record from the database.
*/
export async function DBupdateGuild(
  rows: DBUpdateGuild["rows"],
): Promise<DBGuild> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase client not initialized");
  // Update the guild settings and return the updated row
  const { data, error } = await supabase
    .from("guilds")
    .update(rows)
    .eq("id", rows.id)
    .select()
    .single();
  if (error) throw error;

  return data;
}

export async function getGuildTokenLimit(
  guildId: string,
): Promise<number | boolean> {
  try {
    const tokenLimit = await DBGetGuildSetting(guildId, "token_limit");
    if (tokenLimit === null) {
      console.warn(`Token limit not found for guild ${guildId}`);
      return false;
    }
    return tokenLimit;
  } catch (error) {
    console.error("Error getting guild token limit:", error);
    return false;
  }
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

  if (existingDB) {
    console.log(
      `Guild ${guild.id} (${guild.name}) found in database. Owner ID: ${existingDB.owner_id}`,
    );
  }
  if (!existingDB) {
    console.log(
      `Guild ${guild.id} not found in database. Creating new record...`,
    );

    const user = await APIGetUserByGuild(guild);
    invariant(
      user?.id,
      `User ID is not defined. Cannot create guild record without owner ID. ${guild.id} (${guild.name}), user: ${user?.id}, user object: ${JSON.stringify(user)}`,
    );

    const newDBGuild = await DBUpsertGuild({
      rows: {
        id: guild.id,
        name: guild.name,
        owner_id: user.id,
      },
      onConflictColumn: "id",
      ignoreDuplicates: false,
    });

    console.log(
      `New guild record created: ${newDBGuild ? "Success" : "Failed"}`,
    );
    return newDBGuild;
  }

  return existingDB;
}

export async function deleteDBGuild(guildId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase client not initialized");
  const { error } = await supabase.from("guilds").delete().eq("id", guildId);
  if (error) throw error;
}

export async function setLeftAtForDBGuild(guildId: string): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase client not initialized");
  try {
    await DBupdateGuild({ id: guildId, left_at: new Date().toISOString() });
  } catch (error) {
    throw error;
  }
}
