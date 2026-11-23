import type { Subscription } from "discord.js";
import type { BotEvent, ExtendedClient } from "../../types.ts";
import { recordSubscription } from "../../modules/monetization.ts";

const event: BotEvent<[Subscription, ExtendedClient]> = {
  type: "subscriptionDelete",
  execute: async (value, client) => {
    try {
      await recordSubscription(client, value, true);
    } catch {
      console.error(
        "[monetization] subscriptionDelete failed; recovery will retry",
      );
    }
  },
};
export default event;
