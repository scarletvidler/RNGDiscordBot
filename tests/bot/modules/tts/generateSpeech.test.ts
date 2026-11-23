import assert from "node:assert/strict";
import test from "node:test";
import { generateSpeech } from "../../../../bot/modules/tts/generateSpeech.ts";
import type { PreparedSpeech } from "../../../../bot/modules/tts/convertToSpeech.ts";
import ElevenLabs from "../../../../bot/modules/ElevenLabs.ts";
import { TTSModels } from "../../../../bot/types.ts";
import { getSupabaseAdmin } from "../../../../supabase/client.ts";

const prepared: PreparedSpeech = {
  text: "hello",
  model: TTSModels.ElevenLabsFlashV2_5,
  voiceId: "voice",
  rate: {
    provider: "elevenlabs",
    model: "eleven_flash_v2_5",
    unit: "provider_credits",
    tokens_numerator: 1,
    tokens_denominator: 1,
    estimate_units_per_character: 1,
  },
  estimatedTokens: 5,
};

test("speech reservations protect provider calls and settle before returning audio", async (t) => {
  const oldUrl = process.env.SUPABASE_URL;
  const oldKey = process.env.SUPABASE_SECRET_KEY;
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SECRET_KEY = "test-secret";
  t.after(() => {
    if (oldUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = oldKey;
  });
  const db = getSupabaseAdmin()!;
  const calls: string[] = [];
  let reserveCreated = true;
  let reserveError = false;
  let settlementFailures = 0;
  let providerError: unknown;
  const state = {
    id: "400",
    token_limit: 100,
    token_total_usage: 3,
    token_balance: 97,
    has_active_subscription: true,
    managed_plan: true,
    legacy_features: false,
    reserved_tokens: 0,
  };
  t.mock.method(
    db,
    "rpc",
    (
      name: string,
      args: { guild: string; operation: string; quantity?: number },
    ) => ({
      abortSignal: async () => {
        assert.equal(args.guild, "400");
        assert.equal(args.operation, "600");
        calls.push(name);
        if (name === "monetization_reserve_guild_tokens") {
          assert.equal(args.quantity, 5);
          return {
            data: {
              created: reserveCreated,
              status: "reserved",
              quantity: 5,
              state,
            },
            error: reserveError ? new Error("Insufficient tokens") : null,
          };
        }
        if (name === "monetization_settle_guild_tokens") {
          assert.equal(args.quantity, 3);
          const failure = settlementFailures > 0;
          settlementFailures--;
          return {
            data: { created: false, status: "settled", quantity: 3, state },
            error: failure ? new Error("response lost") : null,
          };
        }
        assert.equal(name, "monetization_release_guild_tokens");
        return {
          data: { created: false, status: "released", quantity: 0, state },
          error: null,
        };
      },
    }),
  );
  t.mock.method(
    ElevenLabs,
    "getInstance",
    () =>
      ({
        convertTextToSpeech: async () => {
          calls.push("provider");
          if (providerError) throw providerError;
          return {
            data: new ReadableStream({
              start(controller) {
                controller.enqueue(new Uint8Array([1, 2, 3]));
                controller.close();
              },
            }),
            rawResponse: {
              headers: new Headers({ "character-cost": "3" }),
              status: 200,
            },
          };
        },
      }) as unknown as ElevenLabs,
  );

  const reset = () => {
    calls.length = 0;
    reserveCreated = true;
    reserveError = false;
    settlementFailures = 0;
    providerError = undefined;
  };
  await t.test(
    "reserves, generates and settles actual usage in order",
    async () => {
      const result = await generateSpeech("400", "600", prepared);
      assert.equal(result?.speech.tokensUsed, 3);
      assert.deepEqual(calls, [
        "monetization_reserve_guild_tokens",
        "provider",
        "monetization_settle_guild_tokens",
      ]);
    },
  );
  await t.test("insufficient funds never call the provider", async () => {
    reset();
    reserveError = true;
    await assert.rejects(
      generateSpeech("400", "600", prepared),
      /Insufficient/,
    );
    assert.deepEqual(calls, ["monetization_reserve_guild_tokens"]);
  });
  await t.test("duplicate messages never call the provider again", async () => {
    reset();
    reserveCreated = false;
    assert.equal(await generateSpeech("400", "600", prepared), null);
    assert.deepEqual(calls, ["monetization_reserve_guild_tokens"]);
  });
  await t.test(
    "definite provider rejection releases the held tokens",
    async () => {
      reset();
      providerError = { statusCode: 400, privatePayload: "do not log" };
      await assert.rejects(
        generateSpeech("400", "600", prepared),
        /provider could not/,
      );
      assert.deepEqual(calls, [
        "monetization_reserve_guild_tokens",
        "provider",
        "monetization_release_guild_tokens",
      ]);
    },
  );
  await t.test(
    "uncertain network failures keep the hold for conservative recovery",
    async () => {
      reset();
      providerError = new Error("connection reset");
      await assert.rejects(
        generateSpeech("400", "600", prepared),
        /provider could not/,
      );
      assert.deepEqual(calls, [
        "monetization_reserve_guild_tokens",
        "provider",
      ]);
    },
  );
  await t.test(
    "lost settlement response retries the same usage without regeneration",
    async () => {
      reset();
      settlementFailures = 1;
      const result = await generateSpeech("400", "600", prepared);
      assert.equal(result?.state.token_total_usage, 3);
      assert.deepEqual(calls, [
        "monetization_reserve_guild_tokens",
        "provider",
        "monetization_settle_guild_tokens",
        "monetization_settle_guild_tokens",
      ]);
    },
  );
  await t.test(
    "settlement outage never releases a successful generation",
    async () => {
      reset();
      settlementFailures = 2;
      await assert.rejects(
        generateSpeech("400", "600", prepared),
        /response lost/,
      );
      assert.deepEqual(calls, [
        "monetization_reserve_guild_tokens",
        "provider",
        "monetization_settle_guild_tokens",
        "monetization_settle_guild_tokens",
      ]);
    },
  );
});
