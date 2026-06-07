import { User } from "discord.js";

export default function getCleanName(user: User): string {
  return user.globalName && /^[\x00-\x7F]+$/.test(user.globalName)
    ? user.globalName
    : user.username;
}
