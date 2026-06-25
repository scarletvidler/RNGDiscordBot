import { GuildMember } from "discord.js";

export default function isRosie(member: GuildMember): boolean {
  const rosieId = process.env.ROSIE_ID || "122548971737579520";
  if (member.id === rosieId) {
    return true;
  }
  return false;
}
