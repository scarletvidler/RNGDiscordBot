# TTS - Idle Timeout

Lerche leaves the voice channel after a period of inactivity.

Admins can change this with:

`/config-afk-timeout seconds: 600`

The minimum is 30 seconds.

Example:

`/config-afk-timeout seconds: 300`

That makes Lerche leave after 5 minutes of silence.

Admins can turn off the spoken leave message for their server:

`/config-leave-message enabled: false`

Lerche will then leave silently. To restore the message:

`/config-leave-message enabled: true`

The leave message is enabled by default. Changes also apply to the current voice
session, unless the leave message has already started playing. Force-stop and
channel-switch commands continue to leave silently.
