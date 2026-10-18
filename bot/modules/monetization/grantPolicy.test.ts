import assert from "node:assert/strict";
import test from "node:test";
import { calculateSubscriptionGrant } from "./grantPolicy.ts";

const basicPeriod = {
  skuId: "100",
  tokensPerPeriod: 50_000,
  periodStart: "2026-10-01T00:00:00.000Z",
  periodEnd: "2026-11-01T00:00:00.000Z",
};

test("grants a full allowance for a new subscription", () => {
  assert.equal(calculateSubscriptionGrant(null, basicPeriod), 50_000);
});

test("does not grant a duplicate billing period", () => {
  assert.equal(calculateSubscriptionGrant(basicPeriod, basicPeriod), 0);
});

test("grants a full allowance on renewal", () => {
  assert.equal(
    calculateSubscriptionGrant(basicPeriod, {
      ...basicPeriod,
      periodStart: "2026-11-01T00:00:00.000Z",
      periodEnd: "2026-12-01T00:00:00.000Z",
    }),
    50_000,
  );
});

test("grants only the difference for an early upgrade", () => {
  assert.equal(
    calculateSubscriptionGrant(basicPeriod, {
      skuId: "200",
      tokensPerPeriod: 150_000,
      periodStart: "2026-10-18T12:00:00.000Z",
      periodEnd: "2026-11-18T12:00:00.000Z",
    }),
    100_000,
  );
});

test("does not claw back tokens for an in-period downgrade", () => {
  assert.equal(
    calculateSubscriptionGrant(basicPeriod, {
      ...basicPeriod,
      skuId: "050",
      tokensPerPeriod: 10_000,
    }),
    0,
  );
});

test("grants the lower allowance when a scheduled downgrade renews", () => {
  assert.equal(
    calculateSubscriptionGrant(basicPeriod, {
      skuId: "050",
      tokensPerPeriod: 10_000,
      periodStart: basicPeriod.periodEnd,
      periodEnd: "2026-12-01T00:00:00.000Z",
    }),
    10_000,
  );
});
