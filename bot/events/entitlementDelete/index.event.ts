import type { Entitlement } from "discord.js";
import type { BotEvent, ExtendedClient } from "../../types.ts";
import { recordEntitlement } from "../../modules/monetization.ts";

const event: BotEvent<[Entitlement, ExtendedClient]> = {
  type: "entitlementDelete",
  execute: async (value, client) => {
    try {
      await recordEntitlement(client, value, true);
    } catch {
      console.error(
        "[monetization] entitlementDelete failed; recovery will retry",
      );
    }
  },
};
export default event;
