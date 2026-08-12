# TTS - Setting Up The TTS Channel

By default, Lerche listens in a channel named `tts` when room mode is disabled.

Admins can change this with:

`/config-channel-name channel-name: bot-tts`

Use the channel name only, without the `#`.

After that, Lerche will only read normal TTS messages from `#bot-tts`.

Admins can use `/toggle-tts-mode` if the server would rather use `/t` messages instead of one dedicated TTS channel.
