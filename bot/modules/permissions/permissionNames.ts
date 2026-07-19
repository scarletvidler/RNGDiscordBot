import type { PermissionResolvable } from "discord.js";

export enum PermissionName {
  Administrator = "Administrator",
  ManageGuild = "ManageGuild",
  ManageRoles = "ManageRoles",
  ManageChannels = "ManageChannels",
  ViewChannel = "ViewChannel",
  SendMessages = "SendMessages",
  ReadMessageHistory = "ReadMessageHistory",
  Connect = "Connect",
  Speak = "Speak",
}

export const ALL_PERMISSION_NAMES: PermissionName[] = Object.values(
  PermissionName,
);

export type PermissionIdentifier = PermissionName | PermissionResolvable;
