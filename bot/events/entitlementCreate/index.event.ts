import type { Entitlement } from "discord.js";
import type { BotEvent, ExtendedClient } from "../../types.ts";
import { recordEntitlementEvent } from "../../modules/monetization/runtime.ts";

const event: BotEvent<[Entitlement, ExtendedClient]> = {
  type: "entitlementCreate",
  execute: async (value, client) => {
    await recordEntitlementEvent(client, value);
  },
};
export default event;
