import type { Subscription } from "discord.js";
import type { BotEvent, ExtendedClient } from "../../types.ts";
import { recordSubscriptionEvent } from "../../modules/monetization/runtime.ts";

const event: BotEvent<[Subscription | null, Subscription, ExtendedClient]> = {
  type: "subscriptionUpdate",
  execute: async (_oldValue, newValue, client) => {
    await recordSubscriptionEvent(client, newValue);
  },
};
export default event;
