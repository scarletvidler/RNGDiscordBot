import { Guild, User } from "discord.js";
import { upsertDiscordUser } from "../../supabase/models/users.ts";

export async function APIGetUserByGuild(guild: Guild): Promise<User | null> {
  try {
    const guildOwner = await guild.fetchOwner();
    if (!guildOwner) {
      console.error(
        `Failed to fetch owner for guild ${guild.id} (${guild.name})`,
      );
      return null;
    }
    return guildOwner.user;
  } catch (error) {
    console.error(
      `Failed to fetch guild owner for guild ${guild.id} (${guild.name}):`,
      error,
    );
    return null;
  }
}
