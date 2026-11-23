import assert from "node:assert/strict";
import test from "node:test";
import type { Message } from "discord.js";
import allowedMessage from "../../../bot/helpers/allowedMessage.ts";

for (const hasHistory of [false, true]) {
  test(`TTS permission gate requires reply history access (${hasHistory})`, async () => {
    const channel = { id: "tts-channel" };
    const message = {
      channel,
      guild: {
        members: {
          me: {
            permissionsIn: (requestedChannel: unknown) => {
              assert.equal(requestedChannel, channel);
              return {
                toArray: () => [
                  "SendMessages",
                  "ViewChannel",
                  "EmbedLinks",
                  "AttachFiles",
                  ...(hasHistory ? ["ReadMessageHistory"] : []),
                ],
              };
            },
          },
        },
      },
    } as unknown as Message<true>;
    assert.deepEqual(await allowedMessage(message), {
      allowed: hasHistory,
      missingPermissions: hasHistory ? [] : ["ReadMessageHistory"],
    });
  });
}
