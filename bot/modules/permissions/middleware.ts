import {
  Guild,
  GuildChannel,
  GuildChannelResolvable,
  type PermissionResolvable,
} from "discord.js";
import { type PermissionIdentifier } from "./permissionNames.ts";

export interface LerchePermissionCheckResult {
  allowed: boolean;
  missingPermissions: string[];
}

export async function getLercheMemberPermissions(
  guild: Guild,
): Promise<PermissionResolvable[] | null> {
  const me =
    guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
  if (!me) return null;
  return me.permissions.toArray();
}

export async function getLercheMemberPermissionsInChannel(
  guild: Guild,
  channel: GuildChannelResolvable,
): Promise<PermissionResolvable[] | null> {
  const me =
    guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
  if (!me) return null;
  const permissionsInChannel = me.permissionsIn(channel);
  return permissionsInChannel.toArray();
}

export async function canLerchePerformAction(
  guild: Guild,
  requiredPermissions: PermissionIdentifier[],
  channel?: GuildChannelResolvable,
): Promise<LerchePermissionCheckResult> {
  const lerchePermissions = channel
    ? await getLercheMemberPermissionsInChannel(guild, channel)
    : await getLercheMemberPermissions(guild);
  if (!lerchePermissions) {
    return {
      allowed: false,
      missingPermissions: requiredPermissions.map((permission) =>
        permission.toString(),
      ),
    };
  }

  const permissions = new Set(
    lerchePermissions.map((permission) => permission.toString()),
  );
  const missingPermissions = requiredPermissions
    .map((permission) => permission.toString())
    .filter((permission) => !permissions.has(permission));

  return {
    allowed: missingPermissions.length === 0,
    missingPermissions,
  };
}

export async function assertLercheCanPerformAction(
  guild: Guild,
  requiredPermissions: PermissionIdentifier[],
): Promise<boolean> {
  const result = await canLerchePerformAction(guild, requiredPermissions);
  if (result.allowed) return true;
  return false;
}

export async function assertLercheCanPerformActionInChannel(
  guild: Guild,
  channel: GuildChannelResolvable,
  requiredPermissions: PermissionIdentifier[],
): Promise<boolean> {
  const result = await canLerchePerformAction(
    guild,
    requiredPermissions,
    channel,
  );
  if (result.allowed) return true;
  return false;
}
