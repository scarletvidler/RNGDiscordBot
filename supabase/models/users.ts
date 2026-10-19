import type { GuildMember, User } from "discord.js";
import { getSupabaseAdmin } from "../client.ts";
import type { Tables } from "../types.ts";

export type DBDiscordUser = Tables<"discord_users">;

export async function upsertDiscordUser(user: User): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;

  const { error } = await supabase.from("discord_users").upsert({
    id: user.id,
    username: user.username,
    global_name: user.globalName,
    avatar_url: user.displayAvatarURL(),
    is_bot: user.bot,
    last_seen_at: new Date().toISOString(),
  });

  if (error) throw error;
}

export async function getDiscordUser(
  userId: string,
): Promise<DBDiscordUser | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase client not initialized");

  const { data, error } = await supabase
    .from("discord_users")
    .select()
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function updateDiscordUserLastVoted(
  userId: string,
  lastVoted: string,
): Promise<DBDiscordUser> {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase client not initialized");

  const { data, error } = await supabase
    .from("discord_users")
    .update({ last_voted: lastVoted })
    .eq("id", userId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function upsertGuildMember(member: GuildMember): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;

  await upsertDiscordUser(member.user);

  const { error } = await supabase.from("guild_members").upsert({
    guild_id: member.guild.id,
    user_id: member.id,
    display_name: member.displayName,
    roles: member.roles.cache.map((role) => ({
      id: role.id,
      name: role.name,
    })),
    joined_at: member.joinedAt?.toISOString() ?? null,
    last_seen_at: new Date().toISOString(),
  });

  if (error) throw error;
}
