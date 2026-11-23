import assert from "node:assert/strict";
import test from "node:test";
import {
  estimateTokens,
  getActualTokens,
  getModelTokenRate,
  tokensForUnits,
} from "../../../../bot/modules/tts/tokenCost.ts";
import type { TokenRate } from "../../../../supabase/models/tokenRates.ts";
import { getSupabaseAdmin } from "../../../../supabase/client.ts";
import { TTSModels } from "../../../../bot/types.ts";

const elevenRate: TokenRate = {
  provider: "elevenlabs",
  model: "eleven_flash_v2_5",
  unit: "provider_credits",
  tokens_numerator: 1,
  tokens_denominator: 1,
  estimate_units_per_character: 1,
};
const fishRate: TokenRate = {
  provider: "fish",
  model: "s2.1-pro",
  unit: "utf8_bytes",
  tokens_numerator: 15,
  tokens_denominator: 182,
  estimate_units_per_character: 1,
};

test("Fish usage counts UTF-8 bytes and rounds the final conversion up", () => {
  assert.equal(estimateTokens("é".repeat(91), fishRate), 15);
  assert.equal(estimateTokens("é".repeat(92), fishRate), 16);
  assert.equal(estimateTokens("😀".repeat(46), fishRate), 16);
  assert.equal(getActualTokens("é".repeat(91), new Headers(), fishRate), 15);
});

test("ElevenLabs uses billed cost rather than applying the Flash discount twice", () => {
  assert.equal(estimateTokens("a".repeat(20), elevenRate), 20);
  assert.equal(
    getActualTokens(
      "a".repeat(20),
      new Headers({ "character-cost": "10" }),
      elevenRate,
    ),
    10,
  );
  assert.equal(
    getActualTokens(
      "hello",
      new Headers({ "character-cost": "0" }),
      elevenRate,
    ),
    0,
  );
  assert.equal(tokensForUnits(1.5, elevenRate), 2);
});

test("missing or invalid provider usage charges a configurable estimate", (t) => {
  t.mock.method(console, "warn", () => {});
  for (const header of [null, "", "NaN", "-5", "Infinity"]) {
    const headers = new Headers();
    if (header !== null) headers.set("character-cost", header);
    assert.equal(
      getActualTokens("hello", headers, {
        ...elevenRate,
        estimate_units_per_character: 2,
      }),
      10,
    );
  }
});

test("invalid rates and usage never reach a provider as a free request", () => {
  assert.throws(
    () => estimateTokens("hello", { ...elevenRate, tokens_denominator: 0 }),
    /Invalid token/,
  );
  assert.throws(
    () => estimateTokens("hello", { ...fishRate, unit: "provider_credits" }),
    /Invalid token/,
  );
  assert.throws(() => tokensForUnits(-1, elevenRate), /Invalid provider/);
  assert.throws(
    () => tokensForUnits(Number.NaN, elevenRate),
    /Invalid provider/,
  );
  assert.throws(
    () => tokensForUnits(2_147_483_648, elevenRate),
    /supported limit/,
  );
});

test("model rates share pending reads, refresh after TTL, and reject missing configuration", async (t) => {
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
  let now = 1000;
  t.mock.method(Date, "now", () => now);
  let reads = 0;
  let data: TokenRate | null = fishRate;
  t.mock.method(db, "rpc", (name: string, args: unknown) => ({
    abortSignal: async () => {
      assert.equal(name, "monetization_get_token_rate");
      assert.deepEqual(args, { provider_name: "fish", model_name: "s2.1-pro" });
      reads++;
      return { data, error: null };
    },
  }));
  const [first, second] = await Promise.all([
    getModelTokenRate(TTSModels.FishPro),
    getModelTokenRate(TTSModels.FishPro),
  ]);
  assert.equal(first, second);
  assert.equal(reads, 1);
  now += 60_000;
  data = null;
  await assert.rejects(getModelTokenRate(TTSModels.FishPro), /not configured/);
  assert.equal(reads, 2);
  data = { ...fishRate, tokens_numerator: 30 };
  assert.equal(
    (await getModelTokenRate(TTSModels.FishPro)).tokens_numerator,
    30,
  );
  assert.equal(reads, 3);
});
