import type { Subscription } from "discord.js";
import type { BotEvent, ExtendedClient } from "../../types.ts";
import { processDiscordSubscription } from "../../modules/monetization/discordMonetization.ts";

const event: BotEvent<[Subscription, ExtendedClient]> = {
  type: "subscriptionCreate",
  async execute(subscription, client) {
    try {
      await processDiscordSubscription(client, subscription);
    } catch (error) {
      console.error(
        `Failed to process subscription create ${subscription.id}:`,
        error,
      );
    }
  },
};

export default event;
