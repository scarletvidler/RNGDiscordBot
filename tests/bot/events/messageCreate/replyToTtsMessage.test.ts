import assert from "node:assert/strict";
import test from "node:test";
import type { Message } from "discord.js";
import { replyToTtsMessage } from "../../../../bot/events/messageCreate/replyToTtsMessage.ts";

test("sends the requested TTS notification once", async () => {
  const sent: unknown[] = [];
  const message = {
    reply: async (options: unknown) => sent.push(options),
  } as unknown as Message<true>;
  const options = { content: "TTS is paused" };
  await replyToTtsMessage(message, options);
  assert.deepEqual(sent, [options]);
});

for (const code of [50013, 50001, 10008, undefined]) {
  test(`contains reply failure ${code} without retrying or logging payloads`, async (t) => {
    const warning = t.mock.method(console, "warn", () => {});
    let attempts = 0;
    const message = {
      id: "message",
      guildId: "guild",
      channelId: "channel",
      reply: async () => {
        attempts++;
        throw Object.assign(new Error("private error details"), {
          code,
          requestBody: { content: "private message" },
        });
      },
    } as unknown as Message<true>;
    await replyToTtsMessage(message, "Notification");
    assert.equal(attempts, 1);
    assert.equal(warning.mock.callCount(), 1);
    assert.deepEqual(warning.mock.calls[0].arguments, [
      "Could not send TTS reply",
      { guildId: "guild", channelId: "channel", messageId: "message", code },
    ]);
  });
}
