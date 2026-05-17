import { GatewayIntentBits } from "discord.js";
import { ExtendedClient } from "../types.ts";

const clientInstance = new ExtendedClient({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
  ],
});

export default clientInstance;