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
- Default and personal voice IDs
- First-message jingle
- Spoken user names
- Idle timeout duration

### Role-Aware Access

Lerche is built for controlled use, not open spam. TTS access is limited to members with the `Lerche Listens` role.

### Utility Commands

Lerche also includes commands for help, version reporting, token balance checks, voice selection, and playback controls.

## Commands

| Command | Description |
|---|---|
| `/help` | Explains how to use Lerche and its commands. |
| `/version` | Shows the current bot version. |
| `/info-token-count` | Shows an admin the guild's remaining TTS token balance. |
| `/config-channel-name` | Changes the text channel Lerche watches for TTS. |
| `/config-afk-timeout` | Changes how long Lerche waits before leaving an idle voice channel. |
| `/config-default-voice` | Sets the guild's default ElevenLabs voice. |
| `/personal-set-my-voice` | Sets the user's personal ElevenLabs voice for the guild. |
| `/toggle-tts-mode` | Toggles `/t` room-prefix mode for the guild. |
| `/toggle-tts-confirmations` | Toggles channel confirmation replies from Lerche. |
| `/toggle-tts-jingle` | Toggles the jingle before the first TTS message. |
| `/toggle-say-users-name` | Toggles speaking the user's name before their message. |
| `/command-force-stop` | Stops playback, clears the queue, and disconnects Lerche. |
| `/command-swap-channel` | Moves active TTS playback to the admin's voice channel. |

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
