import type { GuildMember, User } from "discord.js";
import { getSupabaseAdmin } from "../client.ts";

export async function upsertDiscordUser(user: User): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;

  const { error } = await supabase.from("user").upsert({
    id: user.id,
    username: user.username,
    profile_name: user.globalName,
    avatar_url: user.displayAvatarURL(),
    is_bot: user.bot,
    last_seen_at: new Date().toISOString(),
  });

  if (error) throw error;
}

export async function upsertGuildMember(member: GuildMember): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;

  await upsertDiscordUser(member.user);

  const { error } = await supabase.from("guild_member").upsert({
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
