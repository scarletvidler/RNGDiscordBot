import type { Entitlement } from "discord.js";
import type { BotEvent, ExtendedClient } from "../../types.ts";
import { recordEntitlement } from "../../modules/monetization.ts";

const event: BotEvent<[Entitlement | null, Entitlement, ExtendedClient]> = {
  type: "entitlementUpdate",
  execute: async (_oldValue, newValue, client) => {
    try {
      await recordEntitlement(client, newValue);
    } catch {
      console.error(
        "[monetization] entitlementUpdate failed; recovery will retry",
      );
    }
  },
};
export default event;
