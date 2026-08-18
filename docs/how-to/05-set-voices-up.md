# TTS - Set Lerche's Voices Up

Lerche uses the server's default voice for users who have not chosen their own.

Admins can set the default model and voice ID with:

`/config-default-voice model: <model> voice-id: <voice ID>`

The voice ID is optional. If omitted, Lerche uses the configured default voice for the selected provider.

Each user can set their own model and voice ID with:

`/personal-set-my-voice model-type: <model> voice-id: <voice ID>`

Admins can also choose whether Lerche says each user's name before their message with:

`/toggle-say-users-name`

Running the command again toggles names back the other way.
