// app/bot.server.ts
import { Client, GatewayIntentBits } from "discord.js";
import { joinAndPlay } from "./commands/tts-listen.js";

class ExtendedClient extends Client {
  guildChatId;
  ttsChatId;
}

const client = new ExtendedClient({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
  ],
});

//  Make this a config folder later
client.guildChatId = "832181235031867484";
client.ttsChatId = "1419004262431592559";

const PREFIX = "rng:";

// Commanders should have their own module each later
export function startBot() {
  client.once("ready", () => {
    console.log(`🤖 Logged in as ${client.user?.tag}`);
  });

  client.on("messageCreate", (message) => {
    if (message.author.bot) return;
    if (message.content === `${PREFIX}ping`) {
      message.reply("Pong!");
    }
  });

  // On TTS messages
  client.on("messageCreate", (message) => {
    if (message.author.bot) return;
    if (message.channelId === client.ttsChatId) {
      message.react("🔊");
    } else {
      return;
    }
    if (message.member?.voice.channel) {
      joinAndPlay(message.member.voice.channel, message);
    }
  });

  // Event that runs when the bot is ready
  client.once("ready", () => {
    // Send a message to a specific channel (you need the channel ID)
    const channel = client.channels.cache.get(client.guildChatId); // Replace with your channel ID

    if (channel && channel.isTextBased()) {
      //channel.send(`Hello RNG, I'm ${client.user.tag}`); // Send "Hello, World!" to the channel
    }
  });

  console.log(process.env);
  client.login(process.env.BOT_TOKEN);

  return Promise.resolve();
}
