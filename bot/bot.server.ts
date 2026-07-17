import { Guild } from "discord.js";
import fs from "fs";
import path from "path";
import { registerSlashCommands } from "./modules/registerSlashCommands.ts";
import "dotenv/config";
import getDirectoryRoot from "./helpers/getDirectoryRoot.ts";
import { pathToFileURL } from "url";
import { type BotCommand, type BotEvent } from "./types.ts";
import ClientInstance from "./modules/ClientInstance.ts";
import setUpGuilds from "./modules/setUpGuilds.ts";
import { botVersion } from "./version.ts";

console.log(`Starting Lerche Discord Bot v${botVersion}`);

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
      const raw = module.default ?? module;
      if (raw?.data?.name && typeof raw.execute === "function") {
        ClientInstance.commands.set(
          (raw as BotCommand).data.name,
          raw as BotCommand,
        );
        console.log(`Registering command: ⚡ ${(raw as BotCommand).data.name}`);
      } else {
        console.warn(
          `Invalid command module at ${moduleUrl}. Missing required properties.`,
        );
      }
    }
  }
}

await loadCommands(commandsDir);

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
      (dirent.name.endsWith(".event.js") || dirent.name.endsWith(".event.ts"))
    ) {
      const moduleUrl = pathToFileURL(fullPath).href;
      const module = await import(moduleUrl);
      const eventLabel = path
        .relative(eventsDir, fullPath)
        .replace(/\\/g, "/")
        .replace(/\.(js|ts)$/, "");
      console.log(`Registering event: 📒 ${eventLabel}`);
      const raw = module.default ?? module;
      if (typeof raw?.type === "string" && typeof raw.execute === "function") {
        const event = raw as BotEvent;
        ClientInstance.on(event.type, (...args: unknown[]) =>
          (event.execute as (...a: unknown[]) => void)(...args, ClientInstance),
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
  ClientInstance.once("clientReady", async () => {
    console.log(`🤖 Logged in as ${ClientInstance.user?.tag}`);

    const guildIds = await setUpGuilds(ClientInstance);
    registerSlashCommands(
      ClientInstance,
      process.env.CLIENT_ID!,
      guildIds,
      process.env.BOT_TOKEN!,
    );

    ClientInstance.user!.setPresence({
      activities: [
        {
          type: 3,
          name:
            process.env.BOT_DESCRIPTION! || `${botVersion}: Watching over RNG`,
        },
      ],
      status: "online",
    });

    ClientInstance.user!.setStatus("online");
  });

  ClientInstance.login(process.env.BOT_TOKEN!);

  return Promise.resolve();
}
