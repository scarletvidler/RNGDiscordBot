import assert from "node:assert/strict";
import test from "node:test";
import { parseDiscordPremiumSkus } from "./config.ts";

test("parses Discord premium SKU configuration", () => {
  assert.deepEqual(
    parseDiscordPremiumSkus(
      '[{"skuId":"123456789012345678","name":" Supporter ","tokens":50000}]',
    ),
    [
      {
        skuId: "123456789012345678",
        name: "Supporter",
        tokens: 50_000,
      },
    ],
  );
});

test("accepts an omitted configuration", () => {
  assert.deepEqual(parseDiscordPremiumSkus(undefined), []);
});

test("rejects invalid token quantities", () => {
  assert.throws(
    () =>
      parseDiscordPremiumSkus(
        '[{"skuId":"123456789012345678","name":"Supporter","tokens":0}]',
      ),
    /positive integer/,
  );
});

test("rejects duplicate SKU IDs", () => {
  assert.throws(
    () =>
      parseDiscordPremiumSkus(
        '[{"skuId":"123456789012345678","name":"One","tokens":1000},{"skuId":"123456789012345678","name":"Two","tokens":2000}]',
      ),
    /duplicate skuId/,
  );
});
