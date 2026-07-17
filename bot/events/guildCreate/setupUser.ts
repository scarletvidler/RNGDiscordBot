import type { User } from "discord.js";
import { upsertDiscordUser } from "../../../supabase/models/users.ts";

export async function setupUser(user: User): Promise<User | boolean> {
  try {
    if (user) {
      await upsertDiscordUser(user);
      return true;
    }
    return false;
  } catch (error) {
    console.error("Error syncing user:", error);
    return false;
  }
}
