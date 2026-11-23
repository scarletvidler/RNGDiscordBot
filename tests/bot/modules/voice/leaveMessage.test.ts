import assert from "node:assert/strict";
import test from "node:test";
import type { VoiceConnection } from "@discordjs/voice";
import VoiceInstance from "../../../../bot/modules/voice/VoiceInstance.ts";
import VoicePlayer from "../../../../bot/modules/voice/VoicePlayer.ts";

for (const enabled of [undefined, true, false]) {
  for (const requested of [true, false]) {
    test(`voice teardown respects leave message ${enabled}, sound requested ${requested}`, async () => {
      const calls: string[] = [];
      const instance = Object.create(VoiceInstance.prototype) as VoiceInstance;
      const connections = new Map([["guild", instance]]);
      Object.assign(instance, {
        DBGuild: {
          id: "guild",
          settings: { tts: { leave_message_enabled: enabled } },
        },
        client: { activeVoiceConnections: connections },
        isActive: true,
        isDestroying: false,
        idleCountdownTimer: null,
        connection: {
          state: { status: "ready" },
          off: () => {},
          destroy() {
            calls.push("disconnect");
            this.state.status = "destroyed";
          },
        },
        player: { destroy: () => calls.push("player cleanup") },
        _playDisconnectSound: async () => {
          calls.push("sound");
        },
      });

      await instance.destroy({
        destroyConnection: true,
        playDisconnectSound: requested,
      });

      assert.deepEqual(calls, [
        ...(requested && enabled !== false ? ["sound"] : []),
        "player cleanup",
        "disconnect",
      ]);
      assert.equal(connections.size, 0);
      assert.equal(instance.isActive, false);
      assert.equal(instance.isDestroying, false);
      assert.equal(instance.idleSecondsRemaining, 0);
    });
  }
}

for (const enabled of [undefined, true, false]) {
  test(`player idle teardown respects current leave message preference ${enabled}`, async (t) => {
    t.mock.timers.enable({ apis: ["setInterval"] });
    t.mock.method(console, "log", () => {});
    let currentPreference = true;
    const player = new VoicePlayer({
      idleTimeout: 1,
      ...(enabled === undefined
        ? {}
        : { shouldPlayDisconnectSound: () => currentPreference }),
    });
    t.after(() => player.destroy());
    const asset = t.mock.method(
      player,
      "getSoundAsset",
      () => "disconnect.ogg",
    );
    const play = t.mock.method(player, "playSoundFileDirect", async () => {});
    let disconnected = 0;
    player._setConnection({
      state: { status: "ready" },
      destroy: () => {
        disconnected++;
      },
    } as unknown as VoiceConnection);
    currentPreference = enabled !== false;
    player.idleTimer = Date.now() - 2000;

    t.mock.timers.tick(1000);
    // Drain the playback promise's catch/finally chain.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(play.mock.callCount(), enabled === false ? 0 : 1);
    if (enabled === false) assert.equal(asset.mock.callCount(), 0);
    assert.equal(disconnected, 1);
    assert.equal(player.connection, null);
    assert.equal(player.isDisconnecting, false);
  });
}
