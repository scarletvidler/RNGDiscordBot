import type { Entitlement } from "discord.js";
import type { BotEvent, ExtendedClient } from "../../types.ts";
import { processDiscordEntitlement } from "../../modules/monetization/discordMonetization.ts";

const event: BotEvent<[Entitlement | null, Entitlement, ExtendedClient]> = {
  type: "entitlementUpdate",
  async execute(_oldEntitlement, entitlement, client) {
    try {
      await processDiscordEntitlement(client, entitlement);
    } catch (error) {
      console.error(
        `Failed to process entitlement update ${entitlement.id}:`,
        error,
      );
    }
  },
};

export default event;
