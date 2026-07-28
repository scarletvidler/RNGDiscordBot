import { GuildMember, User } from "discord.js";

export function getCleanName(user: User): string {
  return user.globalName && /^[\x00-\x7F]+$/.test(user.globalName)
    ? user.globalName
    : user.username;
}

export function getCleanDisplayName(member: GuildMember | string): string {
  if (typeof member === "string") {
    return member && /^[\x00-\x7F]+$/.test(member) ? member : "User";
  }

  return member.displayName && /^[\x00-\x7F]+$/.test(member.displayName)
    ? member.displayName
    : member.user.username;
}
