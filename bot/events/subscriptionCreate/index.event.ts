import type { Subscription } from "discord.js";
import type { BotEvent, ExtendedClient } from "../../types.ts";
import { recordSubscription } from "../../modules/monetization.ts";

const event: BotEvent<[Subscription, ExtendedClient]> = {
  type: "subscriptionCreate",
  execute: async (value, client) => {
    try {
      await recordSubscription(client, value);
    } catch {
      console.error(
        "[monetization] subscriptionCreate failed; recovery will retry",
      );
    }
  },
};
export default event;
