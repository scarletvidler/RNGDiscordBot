import type { Entitlement } from "discord.js";
import type { BotEvent, ExtendedClient } from "../../types.ts";
import { recordEntitlement } from "../../modules/monetization.ts";

const event: BotEvent<[Entitlement, ExtendedClient]> = {
  type: "entitlementCreate",
  execute: async (value, client) => {
    try {
      await recordEntitlement(client, value);
    } catch {
      console.error(
        "[monetization] entitlementCreate failed; recovery will retry",
      );
    }
  },
};
export default event;
