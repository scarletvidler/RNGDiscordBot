import type { Subscription } from "discord.js";
import type { BotEvent, ExtendedClient } from "../../types.ts";
import { recordSubscription } from "../../modules/monetization.ts";

const event: BotEvent<[Subscription | null, Subscription, ExtendedClient]> = {
  type: "subscriptionUpdate",
  execute: async (_oldValue, newValue, client) => {
    try {
      await recordSubscription(client, newValue);
    } catch {
      console.error(
        "[monetization] subscriptionUpdate failed; recovery will retry",
      );
    }
  },
};
export default event;
