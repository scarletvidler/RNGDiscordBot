import type { Entitlement } from "discord.js";
import type { BotEvent, ExtendedClient } from "../../types.ts";
import { processDiscordEntitlement } from "../../modules/monetization/discordMonetization.ts";

const event: BotEvent<[Entitlement, ExtendedClient]> = {
  type: "entitlementCreate",
  async execute(entitlement, client) {
    try {
      await processDiscordEntitlement(client, entitlement);
    } catch (error) {
      console.error(
        `Failed to process entitlement create ${entitlement.id}:`,
        error,
      );
    }
  },
};

export default event;
