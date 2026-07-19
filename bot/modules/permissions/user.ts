import {
  GuildMember,
  PermissionsBitField,
  PermissionResolvable,
} from "discord.js";
import {
  getPermission,
  hasRole,
  listPermissions,
  listRoles,
} from "./api.ts";

export function getUserRoles(member: GuildMember): string[] {
  return listRoles(member);
}

export function userHasRole(member: GuildMember, roleName: string): boolean {
  return hasRole(member, roleName);
}

export function userHasPermission(
  member: GuildMember,
  permission: PermissionResolvable,
): boolean {
  return getPermission(member, permission);
}

export function getUserPermissions(member: GuildMember): string[] {
  return listPermissions(member);
}

export function userIsAdmin(member: GuildMember): boolean {
  return member.permissions.has(PermissionsBitField.Flags.Administrator);
}
