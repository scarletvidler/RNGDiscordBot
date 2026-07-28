import { GuildMember, User } from "discord.js";

export function getCleanName(user: User): string {
  return user.globalName && /^[\x00-\x7F]+$/.test(user.globalName)
    ? user.globalName
    : user.username;
}

export function getCleanDisplayName(member: GuildMember | string): string {
  if (typeof member === "string") {
    console.log(`Member is a string: ${member}`);

    return member.replace(/[^a-zA-Z0-9 ]/g, "");
  }

  console.log(`Member is a GuildMember: ${member.displayName}`);

  // return the displaname but only alphanumeric characters and spaces, if the displayname is empty or only contains non-alphanumeric characters, return the username
  const cleanDisplayName = member.displayName.replace(/[^a-zA-Z0-9 ]/g, "");
  return cleanDisplayName;
}
