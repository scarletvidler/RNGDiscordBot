import {
  GuildMember,
  PermissionsBitField,
  PermissionResolvable,
  Role,
} from "discord.js";

export function getUserRoles(member: GuildMember): string[] {
  const roles = member.roles.cache.map((role: Role) => role.name);
  return roles;
}

export function userHasRole(member: GuildMember, roleName: string): boolean {
  return member.roles.cache.some((role: Role) => role.name === roleName);
}

export function userHasPermission(
  member: GuildMember,
  permission: PermissionResolvable,
): boolean {
  return member.permissions.has(permission);
}

export function getUserPermissions(member: GuildMember): string[] {
  const permissions = member.permissions.toArray();
  return permissions;
}

export function userIsAdmin(member: GuildMember): boolean {
  return member.permissions.has(PermissionsBitField.Flags.Administrator);
}
