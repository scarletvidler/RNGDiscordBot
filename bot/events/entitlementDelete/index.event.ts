import type { Entitlement } from "discord.js";
import type { BotEvent, ExtendedClient } from "../../types.ts";
import { recordEntitlementEvent } from "../../modules/monetization/runtime.ts";

const event: BotEvent<[Entitlement, ExtendedClient]> = {
  type: "entitlementDelete",
  execute: async (value, client) => {
    await recordEntitlementEvent(client, value, true);
  },
};
export default event;
