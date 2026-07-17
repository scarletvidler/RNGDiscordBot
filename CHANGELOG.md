# Changelog

All notable changes to this project will be documented in this file.

## VERSION 1.4.0

This patch has been all about making Lerche's TTS much more reliable behind the scenes. Voice connections are now managed per server, with safer connection, reconnection, queue, idle-timeout, and clean-up handling. This should mean fewer stuck connections, fewer errors when moving or disconnecting, and a smoother experience when several messages are sent close together.

Administrators can now use `/tts-swap-channel` to move Lerche from her current voice channel into their own. `/tts-stop` has also been improved: it now stops the server's active TTS session and clears the queue without requiring the administrator to be in the same voice channel.

Joining a new server is more dependable too. Lerche now registers the server's commands, sets up the server and its owner, posts the welcome information in the system channel, and sends the owner a copy directly when possible.

The bot's event and TTS systems have been split into smaller, clearer modules, with improved message validation, audio-stream conversion, type safety, and error handling throughout. Announcement tooling has been tidied up, and a support-admin command has been added for sending help directly to a specific user.

Thank you again for using Lerche and for reporting the odd little voice gremlins when you find them 😊

## 0.1.0

- Added project versioning through `package.json`.
- Added npm release scripts for patch, minor, and major updates.
- Added bot version visibility for development and deployments.
