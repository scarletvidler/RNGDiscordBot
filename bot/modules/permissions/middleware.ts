import { Guild, type PermissionResolvable } from "discord.js";
import { type PermissionIdentifier } from "./permissionNames.ts";

export interface LerchePermissionCheckResult {
  allowed: boolean;
  missingPermissions: string[];
}

async function getLercheMemberPermissions(
  guild: Guild,
): Promise<PermissionResolvable[] | null> {
  const me = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
  if (!me) return null;
  return me.permissions.toArray();
}

export async function canLerchePerformAction(
  guild: Guild,
  requiredPermissions: PermissionIdentifier[],
): Promise<LerchePermissionCheckResult> {
  const lerchePermissions = await getLercheMemberPermissions(guild);
  if (!lerchePermissions) {
    return {
      allowed: false,
      missingPermissions: requiredPermissions.map((permission) =>
        permission.toString(),
      ),
    };
  }

  const permissions = new Set(lerchePermissions.map((permission) => permission.toString()));
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
  actionName = "this action",
): Promise<void> {
  const result = await canLerchePerformAction(guild, requiredPermissions);
  if (result.allowed) return;

  throw new Error(
    `Lerche cannot perform ${actionName}. Missing permissions: ${result.missingPermissions.join(", ")}`,
  );
}
