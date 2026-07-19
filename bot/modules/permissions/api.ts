import {
  GuildMember,
  PermissionsBitField,
  Role,
  type PermissionResolvable,
} from "discord.js";
import { type PermissionIdentifier } from "./permissionNames.ts";

export function getPermission(
  member: GuildMember,
  permission: PermissionIdentifier,
): boolean {
  return member.permissions.has(permission as PermissionResolvable);
}

export function listPermissions(member: GuildMember): string[] {
  return member.permissions.toArray();
}

export function listRoles(member: GuildMember): string[] {
  return member.roles.cache.map((role: Role) => role.name);
}

export function hasRole(member: GuildMember, roleName: string): boolean {
  return member.roles.cache.some((role: Role) => role.name === roleName);
}

export async function setPermission(
  role: Role,
  permission: PermissionIdentifier,
  reason?: string,
): Promise<Role> {
  const nextPermissions = new PermissionsBitField(role.permissions.bitfield);
  nextPermissions.add(permission as PermissionResolvable);
  return role.setPermissions(nextPermissions, reason);
}

export async function upsetPermission(
  role: Role,
  permission: PermissionIdentifier,
  enabled: boolean,
  reason?: string,
): Promise<Role> {
  const nextPermissions = new PermissionsBitField(role.permissions.bitfield);
  if (enabled) {
    nextPermissions.add(permission as PermissionResolvable);
  } else {
    nextPermissions.remove(permission as PermissionResolvable);
  }
  return role.setPermissions(nextPermissions, reason);
}

export async function updatePermissions(
  role: Role,
  permissions: PermissionIdentifier[],
  reason?: string,
): Promise<Role> {
  return role.setPermissions(permissions as PermissionResolvable[], reason);
}

export async function removePermission(
  role: Role,
  permission: PermissionIdentifier,
  reason?: string,
): Promise<Role> {
  const nextPermissions = new PermissionsBitField(role.permissions.bitfield);
  nextPermissions.remove(permission as PermissionResolvable);
  return role.setPermissions(nextPermissions, reason);
}
