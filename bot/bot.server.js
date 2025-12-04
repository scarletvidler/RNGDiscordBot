// app/bot.server.ts
import {
  ActivityType,
  Client,
  Collection,
  GatewayIntentBits,
} from "discord.js";
import fs from "fs";
import path from "path";
import { registerSlashCommands } from "./slash-commands.js";
import "dotenv/config";
import getDirectoryRoot from "./helpers/getDirectoryRoot.js";
import { pathToFileURL } from "url";
import { path as ffmpegPath } from "@ffmpeg-installer/ffmpeg";

process.env.FFMPEG_PATH = ffmpegPath;

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
client.prefix = "rng:";

client.commands = new Collection();

const commandsDirectory = getDirectoryRoot();
const commandsDir = path.join(commandsDirectory, "commands");

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

loadCommands(commandsDir).catch(console.error);

const eventsDirectory = getDirectoryRoot();
const eventsDir = path.join(eventsDirectory, "events");

async function loadEvents(dir) {
  const dirents = fs.readdirSync(dir, { withFileTypes: true });
  for (const dirent of dirents) {
    const fullPath = path.join(dir, dirent.name);
    if (dirent.isDirectory()) {
      await loadEvents(fullPath);
    } else if (
      dirent.isFile() &&
      (dirent.name.endsWith(".js") || dirent.name.endsWith(".ts"))
    ) {
      const moduleUrl = pathToFileURL(fullPath).href;
      const module = await import(moduleUrl);
      console.log(`Loaded events module from ${moduleUrl}`);
      const event = module.default || module;
      if (event && event.type && event.execute) {
        client.on(event.type, (...args) => event.execute(...args, client));
      } else {
        console.warn(
          `Invalid events module at ${moduleUrl}. Missing required properties.`
        );
      }
    }
  }
}

loadEvents(eventsDir).catch(console.error);

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

  client.login(process.env.BOT_TOKEN);

  return Promise.resolve();
}
