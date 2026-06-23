# RNG Discord Bot / Lerche

A Discord bot built with [discord.js](https://discord.js.org/) and TypeScript. Commands and events are loaded dynamically at startup, and slash commands are registered per-guild on login.

## Setup

### Environment variables

Create a `.env` file at the project root with the following:

```env
BOT_TOKEN=your_discord_bot_token
CLIENT_ID=your_discord_application_client_id
ELEVENLABS_API_KEY=your_elevenlabs_api_key

# Optional — defaults shown
TTS_CHANNEL_NAME=tts
default_voice_id=cgSgspJ2msm6clMCkdW9
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

## Versioning

This project uses semantic versions from `package.json`.

```sh
# Tiny fixes and small tweaks, for example 0.1.0 -> 0.1.1
npm run release:patch

# Bigger feature updates, for example 0.1.1 -> 0.2.0
npm run release:minor

# Stable breaking releases, for example 1.4.2 -> 2.0.0
npm run release:major
```

Each release command updates `package.json` and `package-lock.json`, creates a git commit, and creates a git tag. Push the release commit and tag with:

```sh
git push --follow-tags
```

The running bot logs its version at startup and exposes it through `/version`.

## Architecture

```
bot/
├── bot.server.ts          # Entry point — initialises client, loads commands & events
├── slash-commands.ts      # Registers slash commands with Discord and routes interactions
├── types.ts               # ExtendedClient, BotCommand, BotEvent interfaces
├── commands/              # Slash command modules (auto-loaded)
├── events/                # Event handler modules (auto-loaded)
├── modules/               # Shared logic (TTS, voice player, currency converter)
│   └── tts/
│       ├── TTSInstance.ts # Wraps a single TTS message lifecycle (send status reply, play)
│       └── isValidTTS.ts  # Validates channel, permissions, and message length
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

| Command | Description |
|---|---|
| `/poki` | Fetches a random Pokémon (1–505) from PokéAPI and displays its name, height, weight, and sprite in an embed. |
| `/convert <amount> <from> <to>` | Converts a currency amount between two ISO currency codes using the ExchangeRate API. |
| `/tts-stop` | Stops TTS playback and clears the queue. Requires the invoker to be in a voice channel. Reply is ephemeral. |

## TTS (Text-to-Speech)

Messages posted in the configured TTS channel (default `#tts`, overridable via `TTS_CHANNEL_NAME`) by authorised users are spoken aloud in the sender's current voice channel via [ElevenLabs](https://elevenlabs.io/).

**Authorised users:** any member with the Lerche or Amelia role IDs, or anyone with a role named `Lerche Listens` or `Amelia Listens` (for flexible per-server role management).

**Validation (`isValidTTS`):**
- Pinned messages are silently ignored.
- Messages over 400 characters are rejected (the bot owner bypasses this limit).
- Messages from users lacking any of the authorised roles throw a permission error posted back to the channel.

**Voice selection:** users with a role named `male` are spoken with the configured male voice (Adam); everyone else uses the default female voice. Both voices are configurable via environment variables.

**Flow:**
1. `messageCreate` event calls `isValidTTS` to validate channel, permissions, and length.
2. `TTSInstance.create()` sends a `"Listening for TTS messages..."` status message to the channel.
3. `joinAndPlay` (in `ttsListen.ts`) joins the sender's voice channel (or reuses an existing connection).
4. The message is sanitised — newlines flattened, `@mentions` replaced with display names, URLs described in plain English.
5. The sanitised text is sent to ElevenLabs (`eleven_v3` model, 1.2× speed) and streamed back as MP3.
6. `VoicePlayer` queues and plays the audio. The status message is edited to `"Message played in voice channel."`.

### VoicePlayer

`bot/modules/VoicePlayer.ts` manages a single `AudioPlayer` and a sound queue per voice channel. Sounds play sequentially. A ping sound (`ping.ogg`) plays when the bot first joins a channel. After 10 minutes of silence (configurable via `clientInstance.idleTimeout`) the bot plays `disconnect.ogg` and leaves the channel.

`forceStop()` clears the queue and stops playback immediately — called by `/tts-stop`.



### TODO

- Add Database routing for advanced operations and per server customisation
- Add direct logging 
- Add connection to Larken
