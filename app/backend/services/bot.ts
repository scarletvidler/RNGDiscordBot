import dotenv from 'dotenv';
import { Client, Events, GatewayIntentBits } from 'discord.js';
dotenv.config();

class ExtendedClient extends Client {
    guildChatId!: string;
}

const client = new ExtendedClient({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildVoiceStates,
    ],
});

client.guildChatId = '832181235031867484'


client.once('ready', () => {
    if (client.user) {
        console.log(`Logged in as ${client.user.tag}`);
    } else {
        console.error('Client user is null');
    }
});

// Event that runs when the bot is ready
client.once('ready', () => {
    // Send a message to a specific channel (you need the channel ID)
    const channel = client.channels.cache.get(client.guildChatId); // Replace with your channel ID

    if (channel && channel.isTextBased()) {
      channel.send(`Hello RNG, I'm ${client.user.tag}`);  // Send "Hello, World!" to the channel
    }
});

// // Event that runs when a new message is created
// client.on('messageCreate', (message) => {
//     // Check if the message is in the target channel and is not sent by the bot itself
//     if (message.channel.id === client.guildChatId && !message.author.bot) {
//       // Reply to the user with their username in the message
//       message.reply(`Hello ${message.author.username}, please stop talking.`);
//     }
// });

// A map to track the last activity time of each user
const userActivityMap = new Map<string, number>();
client.on('voiceStateUpdate', (oldState, newState) => {
    // Get the user ID
    const userId = newState.id;

    // Get the current time
    const currentTime = Date.now();

});

client.login(process.env.BOT_TOKEN);