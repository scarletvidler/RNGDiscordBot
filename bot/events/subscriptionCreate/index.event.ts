import type { Subscription } from "discord.js";
import type { BotEvent, ExtendedClient } from "../../types.ts";
import { recordSubscriptionEvent } from "../../modules/monetization/runtime.ts";

const event: BotEvent<[Subscription, ExtendedClient]> = {
  type: "subscriptionCreate",
  execute: async (value, client) => {
    await recordSubscriptionEvent(client, value);
  },
};
export default event;
