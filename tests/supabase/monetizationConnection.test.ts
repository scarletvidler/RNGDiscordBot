import assert from "node:assert/strict";
import { test } from "node:test";
import { SKUFlagsBitField, type SKU } from "discord.js";
import {
  getKnownPurchasers,
  getSubscriptions,
  getOneTimePurchases,
  upsertMonetizationSkus,
  upsertEntitlement,
  upsertSubscription,
} from "../../supabase/models/monetization.ts";
import { getSupabaseAdmin } from "../../supabase/client.ts";

const observedAt = "2026-11-12T12:00:00.000Z";
const entitlement = {
  id: "523456789012345678",
  applicationId: "100",
  skuId: "200",
  userId: "300",
  guildId: null,
  type: 1,
  startsTimestamp: null,
  endsTimestamp: null,
  consumed: false,
  deleted: false,
};
const subscription = {
  id: "623456789012345678",
  userId: "300",
  skuIds: ["200"],
  entitlementIds: [entitlement.id],
  renewalSkuIds: null,
  status: 0,
  currentPeriodStartTimestamp: Date.parse(observedAt),
  currentPeriodEndTimestamp: Date.parse("2026-12-12T12:00:00.000Z"),
  canceledTimestamp: null,
};

test("plain models use the shared Supabase client, map Discord fields and propagate failures", async (t) => {
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_SECRET_KEY;
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SECRET_KEY = "test-secret";
  const client = getSupabaseAdmin()!;
  const originalRpc = client.rpc;
  const calls: Array<{ name: string; args: any }> = [];
  let response: { data: unknown; error: unknown } = { data: null, error: null };
  client.rpc = ((name: string, args: unknown) => {
    calls.push({ name, args });
    return {
      abortSignal(signal: AbortSignal) {
        assert.ok(signal instanceof AbortSignal);
        return Promise.resolve(response);
      },
    };
  }) as unknown as typeof client.rpc;
  t.after(() => {
    client.rpc = originalRpc;
    if (previousUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = previousKey;
  });

  await t.test(
    "maps entitlement dates, absent beneficiary and explicit deletion",
    async () => {
      await upsertEntitlement("100", entitlement, observedAt, true);
      assert.deepEqual(calls.at(-1), {
        name: "monetization_apply_entitlement",
        args: {
          r: {
            applicationId: "100",
            id: entitlement.id,
            skuId: "200",
            userId: "300",
            guildId: null,
            type: 1,
            startsAt: null,
            endsAt: null,
            consumed: false,
            deleted: true,
            createdAt: new Date(
              Number((BigInt(entitlement.id) >> 22n) + 1420070400000n),
            ).toISOString(),
            observedAt,
          },
        },
      });
      const guildEntitlement = {
        ...entitlement,
        userId: undefined as unknown as string,
        guildId: "400",
        startsTimestamp: 0,
      };
      await upsertEntitlement("100", guildEntitlement, observedAt);
      assert.equal(calls.at(-1)!.args.r.userId, null);
      assert.equal(calls.at(-1)!.args.r.startsAt, "1970-01-01T00:00:00.000Z");
      await assert.rejects(
        upsertEntitlement("999", entitlement, observedAt),
        /another application/,
      );
      await assert.rejects(
        upsertEntitlement(
          "100",
          { ...entitlement, userId: "", guildId: null },
          observedAt,
        ),
        /beneficiary/,
      );
    },
  );

  await t.test(
    "maps subscription lifecycle fields in one explicit RPC",
    async () => {
      await upsertSubscription("100", subscription, observedAt, true);
      const { name, args } = calls.at(-1)!;
      assert.equal(name, "monetization_apply_subscription");
      assert.equal(args.r.currentPeriodStart, observedAt);
      assert.equal(args.r.currentPeriodEnd, "2026-12-12T12:00:00.000Z");
      assert.equal(args.r.canceledAt, null);
      assert.equal(args.r.deleted, true);
      assert.deepEqual(args.r.entitlementIds, [entitlement.id]);
    },
  );

  await t.test(
    "stores the complete product catalog in bounded batches, excluding groups",
    async () => {
      calls.length = 0;
      const skus = Array.from(
        { length: 101 },
        (_, n) =>
          ({
            id: String(n + 200),
            applicationId: "100",
            name: "Product",
            type: 3,
            flags: new SKUFlagsBitField(4),
          }) as SKU,
      );
      await upsertMonetizationSkus(
        "100",
        [...skus, { ...skus[0], id: "999", type: 6 } as SKU],
        observedAt,
      );
      assert.deepEqual(
        calls.map((call) => call.args.records.length),
        [100, 1],
      );
      assert.equal(calls[0].args.records[0].flags, 4);
      await assert.rejects(
        upsertMonetizationSkus("999", skus, observedAt),
        /another application/,
      );
    },
  );

  await t.test(
    "reads preserve application and user filters and can recover after RPC errors",
    async () => {
      const failure = { code: "503", message: "unavailable" };
      response = { data: null, error: failure };
      await assert.rejects(
        getKnownPurchasers("100"),
        (error) => error === failure,
      );
      response = { data: ["300"], error: null };
      assert.deepEqual(await getKnownPurchasers("100", "200", 25), ["300"]);
      assert.deepEqual(calls.at(-1)!.args, {
        app: "100",
        after_id: "200",
        page_size: 25,
      });
      response = { data: [], error: null };
      await getSubscriptions({ applicationId: "100", userId: "300" });
      assert.deepEqual(calls.at(-1)!.args, {
        kind: "subscriptions",
        app: "100",
        usr: "300",
        guild: null,
        after_id: null,
        page_size: 100,
      });
      await getOneTimePurchases({
        applicationId: "100",
        guildId: "400",
        limit: 10,
      });
      assert.deepEqual(calls.at(-1)!.args, {
        kind: "one_time_purchases",
        app: "100",
        usr: null,
        guild: "400",
        after_id: null,
        page_size: 10,
      });
    },
  );
});
