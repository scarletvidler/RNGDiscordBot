import { GatewayIntentBits } from "discord.js";
import { ExtendedClient } from "../types.ts";
import { DEFAULTS } from "../config/defaults.ts";

const ClientInstance = new ExtendedClient({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
  ],
});

ClientInstance.ownerId = DEFAULTS.ownerId;
ClientInstance.prefix = "rng:";

export default ClientInstance;
