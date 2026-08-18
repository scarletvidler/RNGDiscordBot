import { GatewayIntentBits } from "discord.js";
import { ExtendedClient } from "../types.ts";

const ClientInstance = new ExtendedClient({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
  ],
});

/* TODO: Refactor to be inside the DB once created
 */

ClientInstance.ownerId = "122548971737579520";
ClientInstance.default_elevens_id = "cgSgspJ2msm6clMCkdW9";
ClientInstance.default_fish_id = "9a9cf47702da476aa4629e2506d4a857";
ClientInstance.ttsChannelName = `${process.env.TTS_CHANNEL_NAME || "tts"}`;
ClientInstance.prefix = "rng:";
ClientInstance.idleTimeout = 600; // 10 minutes (seconds)

export default ClientInstance;
