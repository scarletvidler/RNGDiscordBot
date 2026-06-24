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

/* TODO: Refactor to be inside the DB once created
 */

clientInstance.ownerId = "122548971737579520";
clientInstance.femaleRoleId = `${
  process.env.default_voice_id || "cgSgspJ2msm6clMCkdW9"
}`;
clientInstance.maleRoleId = "2gPFXx8pN3Avh27Dw5Ma"; //"alFofuDn3cOwyoz1i44T";
clientInstance.ttsChannelName = `${process.env.TTS_CHANNEL_NAME || "tts"}`;
clientInstance.prefix = "rng:";
clientInstance.idleTimeout = 600; // 10 minutes (seconds)

export default clientInstance;
