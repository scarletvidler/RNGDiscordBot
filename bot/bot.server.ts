import { GatewayIntentBits, Guild } from "discord.js";
import fs from "fs";
import path from "path";
import { registerSlashCommands } from "./slash-commands.ts";
import "dotenv/config";
import getDirectoryRoot from "./helpers/getDirectoryRoot.ts";
import { pathToFileURL } from "url";
import { ExtendedClient, type BotCommand, type BotEvent } from "./types.ts";
import { getGuilds } from "./api/getGuilds.ts";

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
client.ttsChatChannelId = "1419004262431592559";
client.scarletId = "122548971737579520";
client.mochiId = "498267543501537280";
client.lercheRoleId = "1446619757762707557";
client.ameliaRoleId = "1504948220499988632";
client.prefix = "rng:";

const commandsDirectory = getDirectoryRoot();
const commandsDir = path.join(commandsDirectory, "commands");

async function loadCommands(dir: string): Promise<void> {
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
      const raw = module.default ?? module;
      if (raw?.data?.name && typeof raw.execute === "function") {
        client.commands.set((raw as BotCommand).data.name, raw as BotCommand);
        console.log(`Registering command: ${(raw as BotCommand).data.name}`);
      } else {
        console.warn(
          `Invalid command module at ${moduleUrl}. Missing required properties.`,
        );
      }
    }
  }
}

await loadCommands(commandsDir);
console.log(`Loaded ${client.commands.size} commands:`, [
  ...client.commands.keys(),
]);

const eventsDirectory = getDirectoryRoot();
const eventsDir = path.join(eventsDirectory, "events");

async function loadEvents(dir: string): Promise<void> {
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
      const raw = module.default ?? module;
      if (typeof raw?.type === "string" && typeof raw.execute === "function") {
        const event = raw as BotEvent;
        client.on(event.type, (...args: unknown[]) =>
          (event.execute as (...a: unknown[]) => void)(...args, client),
        );
      } else {
        console.warn(
          `Invalid events module at ${moduleUrl}. Missing required properties.`,
        );
      }
    }
  }
}

loadEvents(eventsDir).catch(console.error);

export async function startBot(): Promise<void> {
  client.once("clientReady", () => {
    registerSlashCommands(
      client,
      process.env.CLIENT_ID!,
      [process.env.GUILD_ID1!, process.env.GUILD_ID2!, process.env.GUILD_ID3!, process.env.GUILD_ID4!],
      process.env.BOT_TOKEN!,
    );


    console.log(`🤖 Logged in as ${client.user?.tag}`);

    client.user!.setPresence({
      activities: [
        {
          type: 3,
          name: "Watching over RNG",
        },
      ],
      status: "online",
    });
    client.user!.setStatus("online");
  });


  client.login(process.env.BOT_TOKEN!);

  const guilds: Guild[] = await getGuilds(process.env.BOT_TOKEN!) as Guild[];
  console.log("Guilds the bot is in:", guilds.map((g) => g.name).join(", "));

  return Promise.resolve();
}
