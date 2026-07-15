# Lerche

Lerche is a Discord text-to-speech bot built for voice-active servers that want messages read aloud in a way that feels social, lightweight, and easy to manage.

At its core, Lerche listens for approved messages in a server, converts them into speech with ElevenLabs, and plays them in the sender's current voice channel. It is designed for friend groups and community servers that spend a lot of time in voice and want fast, natural TTS without a lot of setup friction.

## What Lerche Does

Lerche turns text messages into spoken audio in Discord voice channels.

Key behaviour:
- Reads messages from a dedicated TTS text channel by default.
- Can switch into room-prefix mode, where users type `/t` in normal chat and Lerche only reads messages for their current voice room.
- Uses different voices depending on configured server settings and role-based behaviour.
- Queues audio cleanly so overlapping messages do not turn into noise.
- Stops listening after inactivity and disconnects automatically.

## How It Feels In Use

The intended flow is simple:
1. A user joins a voice channel.
2. They post a message in the configured TTS channel, or use `/t` if room-prefix mode is enabled.
3. Lerche validates the message and permissions.
4. The bot joins the voice channel if needed, generates speech, and plays it back.

This makes Lerche useful for casual hangouts, accessibility support, background chatter, and shared voice spaces where not everyone wants to talk constantly but still wants to participate.

## Main Features

### TTS Playback

Lerche uses ElevenLabs to generate speech and plays it directly in Discord voice channels. Messages are cleaned up before playback so they sound more natural, including flattening line breaks, handling mentions, and turning raw links into spoken-friendly text.

### Guild-Specific Settings

Each server can keep its own settings, including:
- TTS channel name
- Reply visibility
- Room-prefix mode
- Male and female voice IDs
- Idle timeout duration

### Role-Aware Access

Lerche is built for controlled use, not open spam. TTS access is limited to approved roles, including flexible named roles like `Lerche Listens` and `Amelia Listens`.

### Utility Commands

Lerche also includes a handful of extra commands outside TTS, including currency conversion, documentation sync, version reporting, and playback controls.

## Commands

| Command | Description |
|---|---|
| `/convert <amount> <from> <to>` | Converts a currency amount between ISO currency codes. |
| `/help` | Explains how to use Lerche and its commands. |
| `/tts-stop` | Stops playback and clears the current TTS queue. |
| `/tts-room-prefix-toggle` | Toggles `/t` room-prefix mode for a guild. |
| `/tts-channel-name` | Changes the text channel Lerche watches for TTS. |
| `/tts-idle-timeout` | Changes how long Lerche waits before leaving an idle voice channel. |
| `/tts-female-voice` | Sets the configured female voice. |
| `/tts-male-voice` | Sets the configured male voice. |
| `/tts-replies-toggle` | Toggles channel reply messages from Lerche. |
| `/version` | Shows the current bot version. |

## Current Limits

Lerche is still in early development.

Right now:
- TTS usage is tracked per guild.
- Lerche warns users as usage approaches the configured token cap.
- TTS stops once the guild reaches the hard token limit.
- Funding support options are planned for heavier users.

That limit exists because voice generation has a real running cost, and the current version of Lerche is still being supported directly rather than through a formal hosted plan.

## Tech Stack

Lerche is built with:
- TypeScript
- discord.js
- ElevenLabs
- Supabase

The bot loads commands and events dynamically at startup, and stores guild-specific settings and logs in Supabase.

## Running Your Own Copy

This repository can still be self-hosted if needed, but it is primarily the source for Lerche itself rather than a contributor guide.

Minimum setup:
- A Discord bot token and application client ID
- An ElevenLabs API key
- A Supabase project or local Supabase instance

Useful scripts:

```sh
npm install
npm run start:bot:dev
npm run typecheck:bot
```

Environment variables currently used include:

```env
BOT_TOKEN=your_discord_bot_token
CLIENT_ID=your_discord_application_client_id
ELEVENLABS_API_KEY=your_elevenlabs_api_key
SUPABASE_URL=http://127.0.0.1:55241
SUPABASE_SECRET_KEY=your_supabase_secret_key
TTS_CHANNEL_NAME=tts
default_voice_id=cgSgspJ2msm6clMCkdW9
```

## Project Shape

The main bot code lives in [bot](bot), with commands in [bot/commands](bot/commands), events in [bot/events](bot/events), and shared runtime logic in [bot/modules](bot/modules). Supabase schema, models, and seeds live in [supabase](supabase).
