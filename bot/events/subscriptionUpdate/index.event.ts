import type { Subscription } from "discord.js";
import type { BotEvent, ExtendedClient } from "../../types.ts";
import { processDiscordSubscription } from "../../modules/monetization/discordMonetization.ts";

const event: BotEvent<[Subscription | null, Subscription, ExtendedClient]> = {
  type: "subscriptionUpdate",
  async execute(_oldSubscription, subscription, client) {
    try {
      await processDiscordSubscription(client, subscription);
    } catch (error) {
      console.error(
        `Failed to process subscription update ${subscription.id}:`,
        error,
      );
    }
  },
};

export default event;
