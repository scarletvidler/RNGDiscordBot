import assert from "node:assert/strict";
import test from "node:test";
import {
  shouldSendUsageMessage,
  usageMessage,
  usageLimitReachedMessage,
} from "../../../bot/modules/supportMessages.ts";
import type { DBGuildWithSettings } from "../../../supabase/models/guilds.ts";

function guild(token_limit = 1000) {
  return {
    settings: { logging: { token_limit, token_total_usage: token_limit } },
  } as DBGuildWithSettings;
}

test("warns only when crossing into the last 100 tokens", () => {
  for (const [previous, next, expected] of [
    [0, 100, false],
    [800, 899, false],
    [899, 900, true],
    [850, 950, true],
    [900, 950, false],
    [950, 1000, false],
    [850, 1000, true],
    [900, 900, false],
  ] as const) {
    assert.equal(
      shouldSendUsageMessage(previous, next, guild()),
      expected,
      `${previous} -> ${next}`,
    );
  }
  assert.equal(shouldSendUsageMessage(4899, 4900, guild(5000)), true);
  assert.equal(shouldSendUsageMessage(3999, 4000, guild(5000)), false);
});

test("notices explain the starter allowance and show the actual remaining balance", () => {
  const warning = JSON.stringify(usageMessage(900, guild()));
  assert.match(warning, /1,000 Lerche Tokens/);
  assert.match(warning, /100 Lerche Tokens remaining/);
  const exhausted = JSON.stringify(usageLimitReachedMessage(guild()));
  assert.match(exhausted, /TTS is paused/);
  assert.match(exhausted, /small starter allowance/);
});
