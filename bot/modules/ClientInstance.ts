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
ClientInstance.femaleRoleId = `${
  process.env.default_voice_id || "cgSgspJ2msm6clMCkdW9"
}`;
ClientInstance.maleRoleId = "2gPFXx8pN3Avh27Dw5Ma"; //"alFofuDn3cOwyoz1i44T";
ClientInstance.ttsChannelName = `${process.env.TTS_CHANNEL_NAME || "tts"}`;
ClientInstance.prefix = "rng:";
ClientInstance.idleTimeout = 600; // 10 minutes (seconds)

export default ClientInstance;
