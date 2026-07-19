import {
  Guild,
  Role,
  type RoleCreateOptions,
  type RoleEditOptions,
} from "discord.js";
import {
  type PermissionIdentifier,
  type PermissionName,
} from "../permissionNames.ts";

export interface RoleCreatePayload {
  name: string;
  color?: RoleCreateOptions["color"];
  hoist?: boolean;
  mentionable?: boolean;
  reason?: string;
  permissions?: PermissionIdentifier[];
}

export interface RoleUpdatePayload {
  name?: string;
  color?: RoleEditOptions["color"];
  hoist?: boolean;
  mentionable?: boolean;
  reason?: string;
}

export function listRoles(guild: Guild): Role[] {
  return [...guild.roles.cache.values()]
    .filter((role) => role.name !== "@everyone")
    .sort((a, b) => b.position - a.position);
}

export function getRole(guild: Guild, roleId: string): Role | null {
  return guild.roles.cache.get(roleId) ?? null;
}

export function getRoleByName(guild: Guild, roleName: string): Role | null {
  return (
    guild.roles.cache.find((role) => role.name.toLowerCase() === roleName.toLowerCase()) ??
    null
  );
}

export async function createRole(
  guild: Guild,
  payload: RoleCreatePayload,
): Promise<Role> {
  return guild.roles.create({
    name: payload.name,
    color: payload.color,
    hoist: payload.hoist,
    mentionable: payload.mentionable,
    permissions: payload.permissions,
    reason: payload.reason,
  });
}

export async function updateRole(
  role: Role,
  payload: RoleUpdatePayload,
): Promise<Role> {
  return role.edit({
    name: payload.name,
    color: payload.color,
    hoist: payload.hoist,
    mentionable: payload.mentionable,
    reason: payload.reason,
  });
}

export async function upsetRole(
  guild: Guild,
  roleName: string,
  payload: Omit<RoleCreatePayload, "name">,
): Promise<Role> {
  const existingRole = getRoleByName(guild, roleName);
  if (existingRole) {
    return updateRole(existingRole, {
      name: roleName,
      color: payload.color,
      hoist: payload.hoist,
      mentionable: payload.mentionable,
      reason: payload.reason,
    });
  }

  return createRole(guild, {
    ...payload,
    name: roleName,
  });
}

export async function setRolePermissions(
  role: Role,
  permissions: PermissionIdentifier[],
  reason?: string,
): Promise<Role> {
  return role.setPermissions(permissions, reason);
}

export async function addRolePermission(
  role: Role,
  permission: PermissionName,
  reason?: string,
): Promise<Role> {
  const nextPermissions = role.permissions.toArray();
  if (!nextPermissions.includes(permission)) nextPermissions.push(permission);
  return role.setPermissions(nextPermissions, reason);
}

export async function removeRolePermission(
  role: Role,
  permission: PermissionName,
  reason?: string,
): Promise<Role> {
  const nextPermissions = role.permissions
    .toArray()
    .filter((existingPermission) => existingPermission !== permission);
  return role.setPermissions(nextPermissions, reason);
}

export async function deleteRole(role: Role, reason?: string): Promise<Role> {
  return role.delete(reason);
}
