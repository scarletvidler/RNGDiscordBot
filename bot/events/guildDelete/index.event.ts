import { setLeftAtForDBGuild } from "../../../supabase/models/guilds.ts";
import { BotEvent } from "../../types.ts";
import type { ExtendedClient } from "../../types.ts";
import type { Guild } from "discord.js";
const event: BotEvent<[Guild, ExtendedClient]> = {
  type: "guildDelete",
  execute: async (guild: Guild, extendedClient: ExtendedClient) => {
    try {
      console.log(
        `Left guild: ${guild.name} (ID: ${guild.id}), owner: ${guild.ownerId})`,
      );
      await setLeftAtForDBGuild(guild.id);
      // Remove the voice connection for this guild if it exists
      const voiceInstance = extendedClient.activeVoiceConnections.get(guild.id);
      if (voiceInstance) {
        await voiceInstance.destroy({ destroyConnection: true });
      }
    } catch (error) {
      console.error("Error in guildDelete event:", error);
    }
  },
};

export default event;
