import { DBGetGuildSetting } from "../../supabase/models/guilds.ts";
import type { ExtendedClient } from "../types.ts";

export const GUILD_BANNED_MESSAGE = "This server is banned from using Lerche.";

// Read on every request so database bans and unbans do not depend on cache expiry.
// Database errors propagate to the caller: access must not bypass a failed check.
export async function canGuildUseLerche(
  guildId: string,
  client: ExtendedClient,
): Promise<boolean> {
  const isBanned = await DBGetGuildSetting(guildId, "is_banned");
  const guild = client.installedGuilds.find((guild) => guild.id === guildId);
  if (guild) guild.is_banned = isBanned === true;
  if (isBanned !== true) return true;

  await client.activeVoiceConnections.get(guildId)?.destroy({
    destroyConnection: true,
    playDisconnectSound: false,
  });
  return false;
}
