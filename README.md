# RNG Discord Bot / Lerche

A Discord bot built with [discord.js](https://discord.js.org/) and TypeScript. Commands and events are loaded dynamically at startup, and slash commands are registered per-guild on login.

## Setup

### Environment variables

Create a `.env` file at the project root with the following:

```env
BOT_TOKEN=your_discord_bot_token
CLIENT_ID=your_discord_application_client_id
ELEVENLABS_API_KEY=your_elevenlabs_api_key
```

### Run

```sh
# Install Dependancies
npm i
# Start the Web Server (Remix)
npm run dev
# Start the dev Bot (Chisato)
npm run start:bot:dev
```

## Architecture

```
bot/
├── bot.server.ts          # Entry point — initialises client, loads commands & events
├── slash-commands.ts      # Registers slash commands with Discord and routes interactions
├── types.ts               # ExtendedClient, BotCommand, BotEvent interfaces
├── commands/              # Slash command modules (auto-loaded)
├── events/                # Event handler modules (auto-loaded)
├── modules/               # Shared logic (TTS, voice player, currency converter)
├── api/                   # Discord REST wrappers
├── helpers/               # Utility functions
└── assets/sounds/         # Audio files used by the voice player
```

### Command & event loading

On startup, `bot.server.ts` recursively scans `commands/` and `events/` and dynamically imports every `.ts`/`.js` file it finds. A valid command module must export a default with `data` (a `SlashCommandBuilder`) and an `execute` function. A valid event module must export a default with `type` (the event name) and an `execute` function.

Slash commands are registered against up to three guilds immediately after the client emits `clientReady`.

### Adding a command

Create a new file in `bot/commands/`. It will be picked up automatically on the next restart.

```ts
import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import type { BotCommand } from "../types.ts";

const command: BotCommand = {
  data: new SlashCommandBuilder()
    .setName("example")
    .setDescription("An example command"),

  async execute(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.reply("Hello!");
  },
};

export default command;
```

### Adding an event

Create a new file in `bot/events/`. The client instance is passed as the last argument to `execute`.

```ts
import type { BotEvent } from "../types.ts";

const event: BotEvent = {
  type: "messageCreate",
  execute: async (message) => {
    // handle event
  },
};

export default event;
```

## TODO

- [ ] **Guild class** — create a `Guild` class that attaches to the `clientInstance` for each server found via the `getGuild` request, used to store per-guild preferences.

## Commands

| Command                         | Description                                                                                                  |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `/roll`                         | Fetches a random Pokémon (1–505) from PokéAPI and displays its name, height, weight, and sprite in an embed. |
| `/convert <amount> <from> <to>` | Converts a currency amount between two ISO currency codes using the ExchangeRate API.                        |

## TTS (Text-to-Speech)

Messages posted in the `#tts` channel by authorised users are spoken aloud in the sender's current voice channel via [ElevenLabs](https://elevenlabs.io/).

**Authorised users:** the configured Scarlet user ID, or any member with the Lerche or Amelia roles.

**Flow:**

1. `messageCreate` event fires and checks the channel name and author permissions.
2. `joinAndPlay` (in `ttsListen.ts`) joins the sender's voice channel (or reuses an existing connection).
3. The message is sanitised — newlines flattened, `@mentions` replaced with display names, URLs described in plain English.
4. The sanitised text is sent to ElevenLabs (`eleven_v3` model, Lerche voice, 1.5× speed) and streamed back as MP3.
5. `VoicePlayer` queues and plays the audio.

### VoicePlayer

A singleton (`bot/modules/VoicePlayer.ts`) that manages a single `AudioPlayer` and a sound queue. Sounds play sequentially. A ping sound (`ping.ogg`) plays when the bot first joins a channel. After 5 minutes of silence the bot plays `disconnect.ogg` and leaves the channel.
