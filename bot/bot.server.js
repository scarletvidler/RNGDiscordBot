// app/bot.server.ts
import {
  ActivityType,
  Client,
  Collection,
  GatewayIntentBits,
} from "discord.js";
import { joinAndPlay } from "./commands/tts-listen.js";
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { registerSlashCommands } from "./slash-commands.js";
import { REST, Routes } from "discord.js";
import "dotenv/config";
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
client.scarletId = "122548971737579520";

const PREFIX = "rng:";

client.commands = new Collection();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const commandsDir = path.join(__dirname, "commands");

async function loadCommands(dir) {
  const dirents = fs.readdirSync(dir, { withFileTypes: true });
  for (const dirent of dirents) {
    const fullPath = path.join(dir, dirent.name);
    if (dirent.isDirectory()) {
      await loadCommands(fullPath);
    } else if (
      dirent.isFile() &&
      (dirent.name.endsWith(".js") || dirent.name.endsWith(".ts"))
    ) {
      const moduleUrl = pathToFileURL(fullPath).href;
      const module = await import(moduleUrl);
      console.log(`Loaded command module from ${moduleUrl}`);
      const cmd = module.default || module;
      if (cmd && cmd.data && cmd.execute) {
        client.commands.set(cmd.data.name, cmd);
      } else {
        console.warn(
          `Invalid command module at ${moduleUrl}. Missing required properties.`
        );
      }
    }
  }
}

loadCommands(commandsDir)
  .then(() => {
    client.commands.forEach((command) => {
      console.log(`Command: ${command.name}`);
    });

    const rest = new REST().setToken(process.env.BOT_TOKEN);
    // and deploy your commands!
    (async () => {
      try {
        console.log(
          `Started refreshing ${client.commands.size} application (/) commands.`
        );

        // The put method is used to fully refresh all commands in the guild with the current set
        const guildIds = [process.env.GUILD_ID1, process.env.GUILD_ID2];

        for (const guildId of guildIds) {
          if (!guildId) {
            console.warn("Guild ID is not defined in environment variables.");
            continue;
          }
          const data = await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, guildId),
            { body: client.commands.map((cmd) => cmd.data.toJSON()) }
          );
          console.log(
            `Successfully reloaded ${data.length} application (/) commands for guild ${guildId}.`
          );
        }
      } catch (error) {
        // And of course, make sure you catch and log any errors!
        console.error(error);
      }
    })();
  })
  .catch(console.error);

// Commanders should have their own module each later
export function startBot() {
  client.once("clientReady", () => {
    registerSlashCommands(client);
    console.log(`🤖 Logged in as ${client.user?.tag}`);

    client.user.setPresence({
      activities: [
        {
          type: ActivityType.Watching,
          name: "over RNG",
        },
      ],
      status: "online",
    });
    client.user.setStatus("online");

    // client.user.setBanner(
    //   "https://i.pinimg.com/736x/f6/25/4a/f6254a9454e8712548a65cf824fc859f.jpg"
    // );
  });

  client.on("messageCreate", (message) => {
    if (message.author.bot) return;
    if (message.content === `${PREFIX}ping`) {
      message.reply("Pong!");
    }
  });

  // On TTS messages
  client.on("messageCreate", async (message) => {
    try {
      if (message.author.bot) return;
      if (
        (message.channelId === client.ttsChatId ||
          message.channel.name === "tts") &&
        message.author.id === client.scarletId
      ) {
        message.react("⏫");
      } else {
        return;
      }
      if (message.member?.voice.channel) {
        await joinAndPlay(message.member.voice.channel, message);
        // message.reactions.removeAll().then(() => {
        // });
        // React with an audio emoji when done
        message.react("🔊");
      }
    } catch (error) {
      console.error("Error handling TTS message:", error);
      message.react("❌");
      // Send a message to the same channel
      const channel = await client.channels.fetch(message.channelId);
      if (channel && channel.isTextBased()) {
        channel.send(
          `There was an error processing the TTS message. Please try again later.`
        );
      }
    }
  });

  // Event that runs when the bot is ready
  client.once("clientReady", () => {
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
