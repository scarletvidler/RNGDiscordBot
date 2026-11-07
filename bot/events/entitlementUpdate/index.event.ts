import type { Entitlement } from "discord.js";
import type { BotEvent, ExtendedClient } from "../../types.ts";
import { recordEntitlementEvent } from "../../modules/monetization/runtime.ts";

const event: BotEvent<[Entitlement | null, Entitlement, ExtendedClient]> = {
  type: "entitlementUpdate",
  execute: async (_oldValue, newValue, client) => {
    await recordEntitlementEvent(client, newValue);
  },
};
export default event;
