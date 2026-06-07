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

/* TODO: Refactor to be less manual, do we use a sqlLite
    database or something else? Maybe just a json file for now?
*/

clientInstance.ownerId = "122548971737579520";
clientInstance.mochiId = "498267543501537280";
clientInstance.femaleRoleId = `${
  process.env.default_voice_id || "cgSgspJ2msm6clMCkdW9"
}`;
clientInstance.maleRoleId = "goT3UYdM9bhm0n2lmKQx";
clientInstance.ttsChannelName = `${process.env.TTS_CHANNEL_NAME || "tts"}`;
clientInstance.prefix = "rng:";
clientInstance.idleTimeout = 600000; // 10 minutes

export default clientInstance;
