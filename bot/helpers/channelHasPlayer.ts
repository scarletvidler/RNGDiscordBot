import type { Channel } from "discord.js";
import type { channelWithPlayer } from "../types.ts";

export default function channelHasPlayer(
  channel: Channel | channelWithPlayer,
): channel is channelWithPlayer {
  return "player" in channel && channel.player !== undefined;
}
