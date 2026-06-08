import { Guild } from "discord.js";
import fs from "fs";
import path from "path";
import { registerSlashCommands } from "./modules/registerSlashCommands.ts";
import "dotenv/config";
import getDirectoryRoot from "./helpers/getDirectoryRoot.ts";
import { pathToFileURL } from "url";
import { type BotCommand, type BotEvent } from "./types.ts";
import { getGuilds } from "./api/getGuilds.ts";
import clientInstance from "./modules/client.ts";

const client = clientInstance;

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
        client.commands.set((raw as BotCommand).data.name, raw as BotCommand);
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
      (dirent.name.endsWith(".js") || dirent.name.endsWith(".ts"))
    ) {
      const moduleUrl = pathToFileURL(fullPath).href;
      const module = await import(moduleUrl);
      console.log(
        `Registering event: 📒 ${dirent.name.replace(/\.(js|ts)$/, "")}`,
      );
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
  client.once("clientReady", async () => {
    console.log(`🤖 Logged in as ${client.user?.tag}`);
    const guilds: Guild[] = (await getGuilds(
      process.env.BOT_TOKEN!,
    )) as Guild[];
    const guildIds: string[] = guilds.map((guild) => guild.id);
    guilds.map((guild) => {
      console.log(`Connected to guild: 🏯 ${guild.name} (ID: ${guild.id})`);
    });

    registerSlashCommands(
      client,
      process.env.CLIENT_ID!,
      guildIds,
      process.env.BOT_TOKEN!,
    );

    client.user!.setPresence({
      activities: [
        {
          type: 3,
          name: process.env.BOT_DESCRIPTION! || "Watching over RNG",
        },
      ],
      status: "online",
    });

    client.user!.setStatus("online");
  });

  client.login(process.env.BOT_TOKEN!);

  return Promise.resolve();
}
