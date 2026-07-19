import { Guild, PermissionsBitField, Role } from "discord.js";

export interface LercheRoleCheckResult {
  allowed: boolean;
  reason?: string;
}

export async function canLercheManageRoles(
  guild: Guild,
): Promise<LercheRoleCheckResult> {
  const me = guild.members.me ?? (await guild.members.fetchMe().catch(() => null));
  if (!me) {
    return {
      allowed: false,
      reason: "Lerche member context is not available in this guild.",
    };
  }

  if (!me.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
    return {
      allowed: false,
      reason: "Lerche is missing ManageRoles permission.",
    };
  }

  return { allowed: true };
}

export async function canLercheManageRole(
  guild: Guild,
  role: Role,
): Promise<LercheRoleCheckResult> {
  const baseCheck = await canLercheManageRoles(guild);
  if (!baseCheck.allowed) return baseCheck;

  if (!role.editable) {
    return {
      allowed: false,
      reason:
        "Lerche cannot edit this role due to Discord role hierarchy or missing permissions.",
    };
  }

  return { allowed: true };
}

export async function assertLercheCanManageRoles(guild: Guild): Promise<void> {
  const result = await canLercheManageRoles(guild);
  if (result.allowed) return;
  throw new Error(result.reason ?? "Lerche cannot manage roles.");
}

export async function assertLercheCanManageRole(
  guild: Guild,
  role: Role,
): Promise<void> {
  const result = await canLercheManageRole(guild, role);
  if (result.allowed) return;
  throw new Error(result.reason ?? `Lerche cannot manage role: ${role.name}.`);
}
