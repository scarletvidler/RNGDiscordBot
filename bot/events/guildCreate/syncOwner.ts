import type { Guild } from "discord.js";
import { upsertDiscordUser } from "../../../supabase/models/users.ts";
import { APIGetUserByGuild } from "../../api/getUser.ts";

export async function syncGuildOwner(guild: Guild): Promise<void> {
  const user = await APIGetUserByGuild(guild);
  if (user) {
    await upsertDiscordUser(user);
  }
}
