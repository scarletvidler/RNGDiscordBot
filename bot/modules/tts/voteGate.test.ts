import assert from "node:assert/strict";
import test from "node:test";
import {
  isGuildExemptFromVoting,
  isVoteRequired,
  NEW_USER_GRACE_PERIOD_MS,
  VOTE_VALIDITY_PERIOD_MS,
} from "./voteGate.ts";

const NOW = Date.parse("2026-10-19T12:00:00.000Z");

test("exempts guilds with an active subscription from voting", () => {
  assert.equal(
    isGuildExemptFromVoting({ has_active_subscription: true }),
    true,
  );
  assert.equal(
    isGuildExemptFromVoting({ has_active_subscription: false }),
    false,
  );
});

test("allows a user who is still inside the two-day grace period", () => {
  assert.equal(
    isVoteRequired(
      {
        first_seen_at: new Date(NOW - NEW_USER_GRACE_PERIOD_MS).toISOString(),
        last_voted: null,
      },
      NOW,
    ),
    false,
  );
});

test("requires a vote after the two-day grace period", () => {
  assert.equal(
    isVoteRequired(
      {
        first_seen_at: new Date(
          NOW - NEW_USER_GRACE_PERIOD_MS - 1,
        ).toISOString(),
        last_voted: null,
      },
      NOW,
    ),
    true,
  );
});

test("allows a vote that is one week old", () => {
  assert.equal(
    isVoteRequired(
      {
        first_seen_at: new Date(NOW - 30 * 24 * 60 * 60 * 1_000).toISOString(),
        last_voted: new Date(NOW - VOTE_VALIDITY_PERIOD_MS).toISOString(),
      },
      NOW,
    ),
    false,
  );
});

test("requires another vote when the previous vote is over one week old", () => {
  assert.equal(
    isVoteRequired(
      {
        first_seen_at: new Date(NOW - 30 * 24 * 60 * 60 * 1_000).toISOString(),
        last_voted: new Date(NOW - VOTE_VALIDITY_PERIOD_MS - 1).toISOString(),
      },
      NOW,
    ),
    true,
  );
});
