import assert from "node:assert/strict";
import { test } from "node:test";
import {
  Collection,
  SKUFlagsBitField,
  type Client,
  type Entitlement,
  type SKU,
  type Subscription,
} from "discord.js";
import { getSupabaseAdmin } from "../../../supabase/client.ts";
import { keyedQueue } from "../../../bot/helpers/keyedQueue.ts";
import {
  recordEntitlement,
  recordSubscription,
  syncMonetization,
  startDiscordMonetization,
  stopDiscordMonetization,
  redeemGuildTopup,
} from "../../../bot/modules/monetization.ts";
import entitlementUpdate from "../../../bot/events/entitlementUpdate/index.event.ts";
import subscriptionUpdate from "../../../bot/events/subscriptionUpdate/index.event.ts";

const app = "123456789012345678";
const skuId = "223456789012345678";
const subSku = "323456789012345678";
const userId = "423456789012345678";
const entitlementId = "523456789012345678";
const subscriptionId = "623456789012345678";
const sku = (id = skuId, type = 3) =>
  ({
    id,
    applicationId: app,
    name: "Product",
    type,
    flags: new SKUFlagsBitField(4),
  }) as SKU;
const entitlement = (extra = {}) =>
  ({
    id: entitlementId,
    applicationId: app,
    skuId,
    userId,
    guildId: null,
    type: 1,
    startsTimestamp: null,
    endsTimestamp: null,
    consumed: false,
    deleted: false,
    ...extra,
  }) as Entitlement;
const subscription = (extra = {}) =>
  ({
    id: subscriptionId,
    userId,
    skuIds: [subSku],
    entitlementIds: [],
    renewalSkuIds: null,
    status: 0,
    currentPeriodStartTimestamp: Date.parse("2026-11-01"),
    currentPeriodEndTimestamp: Date.parse("2026-12-01"),
    canceledTimestamp: null,
    ...extra,
  }) as unknown as Subscription;
const collection = <T extends { id: string }>(values: T[]) =>
  new Collection(values.map((value) => [value.id, value]));
function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

test("monetization uses queued model functions and Discord.js recovery", async (t) => {
  const oldUrl = process.env.SUPABASE_URL;
  const oldKey = process.env.SUPABASE_SECRET_KEY;
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SECRET_KEY = "test-secret";
  const db = getSupabaseAdmin()!;
  const originalRpc = db.rpc;
  type RecordValue = {
    id: string;
    skuId: string;
    skuIds: string[];
    observedAt: string;
    consumed: boolean;
    deleted: boolean;
    status: number;
    renewalSkuIds: string[] | null;
    userId: string | null;
    guildId: string | null;
  };
  let writes: Array<{ name: string; value: RecordValue }> = [];
  let users: string[] = [];
  let rpcCalls: string[] = [];
  let fulfillmentIds: string[] = [];
  let subscriptionEntitlementIds: string[] = [];
  let pendingConsumptionIds: string[] = [];
  let fulfillmentRpc: (
    name: string,
    args: any,
  ) => Promise<unknown> = async () => null;
  let write: (
    name: string,
    value: RecordValue,
  ) => Promise<void> = async () => {};
  db.rpc = ((name: string, args: { r?: RecordValue }) => ({
    abortSignal: () =>
      (async () => {
        rpcCalls.push(name);
        if (name === "monetization_known_purchasers")
          return { data: users, error: null };
        if (name === "monetization_fulfillment_entitlements")
          return { data: fulfillmentIds, error: null };
        if (name === "monetization_pending_consumptions")
          return { data: pendingConsumptionIds, error: null };
        if (name === "monetization_get_subscription_entitlements")
          return { data: subscriptionEntitlementIds, error: null };
        if (name === "monetization_get_granted_features")
          return { data: [], error: null };
        if (args.r) {
          await write(name, args.r);
          writes.push({ name, value: args.r });
        }
        return { data: await fulfillmentRpc(name, args), error: null };
      })(),
  })) as unknown as typeof db.rpc;
  keyedQueue.start();
  t.after(async () => {
    await stopDiscordMonetization();
    await keyedQueue.stop();
    db.rpc = originalRpc;
    if (oldUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = oldKey;
  });
  function setup() {
    writes = [];
    users = [];
    rpcCalls = [];
    fulfillmentIds = [];
    subscriptionEntitlementIds = [];
    pendingConsumptionIds = [];
    fulfillmentRpc = async () => null;
    write = async () => {};
    const requests: Array<{ kind: string; options: any }> = [];
    const application = {
      id: app,
      fetchSKUs: async () => collection([sku(), sku(subSku, 5)]),
      entitlements: {
        consume: async (_id: string) => {},
        fetch: async (options: any) => {
          requests.push({ kind: "entitlements", options });
          return collection<Entitlement>([]);
        },
      },
      subscriptions: {
        fetch: async (options: any) => {
          requests.push({ kind: "subscriptions", options });
          return collection<Subscription>([]);
        },
      },
    };
    return {
      client: { application } as unknown as Client,
      application,
      requests,
    };
  }

  await t.test(
    "live events use cached catalog and persist updates, cancellation and tombstones",
    async () => {
      const { client, application } = setup();
      await syncMonetization(client);
      application.fetchSKUs = async () => {
        throw new Error("Unexpected catalog request");
      };
      await recordEntitlement(client, entitlement());
      await recordEntitlement(client, entitlement({ consumed: true }));
      await recordEntitlement(client, entitlement(), true);
      await recordSubscription(
        client,
        subscription({ status: 2, canceledTimestamp: Date.now() }),
      );
      await recordSubscription(client, subscription(), true);
      assert.deepEqual(
        writes.map((row) => row.value.deleted),
        [false, false, true, false, true],
      );
      assert.equal(writes[1].value.consumed, true);
      assert.equal(writes[3].value.status, 2);
      assert.ok(writes[0].value.observedAt < writes[1].value.observedAt);
    },
  );

  await t.test(
    "foreign applications and unknown renewal products fail without saving",
    async () => {
      const { client } = setup();
      await syncMonetization(client);
      await assert.rejects(
        recordEntitlement(client, entitlement({ applicationId: "999" })),
        /Foreign/,
      );
      await assert.rejects(
        recordSubscription(client, subscription({ renewalSkuIds: ["999"] })),
        /Unknown/,
      );
      assert.equal(writes.length, 0);
      await recordEntitlement(
        client,
        entitlement({
          userId: undefined,
          guildId: "723456789012345678",
          type: 3,
        }),
      );
      assert.equal(writes[0].value.userId, null);
      assert.equal(writes[0].value.guildId, "723456789012345678");
    },
  );

  await t.test(
    "nullable old-cache update handlers save the new Discord object",
    async () => {
      const { client } = setup();
      await syncMonetization(client);
      await entitlementUpdate.execute(
        null,
        entitlement({ consumed: true }),
        client as never,
      );
      await subscriptionUpdate.execute(
        null,
        subscription({ status: 2 }),
        client as never,
      );
      assert.equal(writes[0].value.consumed, true);
      assert.equal(writes[1].value.status, 2);
    },
  );

  await t.test(
    "new donation and renewal SKUs refresh the catalog without configuration",
    async () => {
      const { client, application } = setup();
      await syncMonetization(client);
      const donation = "823456789012345678";
      const renewal = "923456789012345678";
      let reads = 0;
      application.fetchSKUs = async () => {
        reads++;
        return collection([
          sku(),
          sku(subSku, 5),
          sku(donation),
          sku(renewal, 5),
          sku("923456789012345679", 6),
        ]);
      };
      await recordSubscription(
        client,
        subscription({ renewalSkuIds: [renewal] }),
      );
      await recordEntitlement(
        client,
        entitlement({ skuId: donation, type: 4 }),
      );
      assert.equal(reads, 1);
      assert.deepEqual(writes[0].value.renewalSkuIds, [renewal]);
      assert.equal(writes[1].value.skuId, donation);
    },
  );

  await t.test(
    "same-key writes are ordered, snapshots survive cache mutation, and other keys progress",
    async () => {
      const { client } = setup();
      await syncMonetization(client);
      const started = gate(),
        finish = gate();
      let attempts = 0;
      write = async (name) => {
        if (name === "monetization_apply_entitlement" && ++attempts === 1) {
          started.release();
          await finish.promise;
        }
      };
      const value = entitlement();
      const first = recordEntitlement(client, value);
      await started.promise;
      const second = recordEntitlement(client, value);
      value.consumed = true;
      await recordSubscription(client, subscription());
      assert.equal(writes.length, 1);
      finish.release();
      await Promise.all([first, second]);
      assert.deepEqual(
        writes
          .filter((row) => row.name === "monetization_apply_entitlement")
          .map((row) => row.value.consumed),
        [false, false],
      );
      const subscriptionGate = gate();
      const blocking = keyedQueue.run(
        `monetization:${app}:subscription:${subscriptionId}`,
        () => subscriptionGate.promise,
      );
      const sub = subscription();
      const pending = recordSubscription(client, sub);
      sub.skuIds.push("999");
      subscriptionGate.release();
      await Promise.all([blocking, pending]);
      assert.deepEqual(writes.at(-1)?.value.skuIds, [subSku]);
    },
  );

  await t.test(
    "failed writes release their queue and can be retried",
    async () => {
      const { client } = setup();
      await syncMonetization(client);
      let fail = true;
      write = async () => {
        if (fail) throw new Error("temporary database failure");
      };
      await assert.rejects(
        recordEntitlement(client, entitlement()),
        /temporary/,
      );
      fail = false;
      await recordEntitlement(client, entitlement());
      assert.equal(writes.length, 1);
    },
  );

  await t.test(
    "same-millisecond observations remain strictly increasing",
    async () => {
      const { client } = setup();
      await syncMonetization(client);
      const originalNow = Date.now;
      Date.now = () => 1;
      try {
        await recordSubscription(client, subscription());
        await recordSubscription(client, subscription({ status: 2 }));
      } finally {
        Date.now = originalNow;
      }
      assert.equal(
        Date.parse(writes[1].value.observedAt) -
          Date.parse(writes[0].value.observedAt),
        1,
      );
    },
  );

  await t.test(
    "recovery includes ended/deleted records, paginates and shares overlapping scans",
    async () => {
      const { client, application, requests } = setup();
      const firstPage = Array.from({ length: 100 }, (_, n) =>
        entitlement({ id: String(BigInt(entitlementId) + BigInt(n)) }),
      );
      application.entitlements.fetch = async (options) => {
        requests.push({ kind: "entitlements", options });
        return collection(
          options.after
            ? [entitlement({ id: "999456789012345678" })]
            : firstPage,
        );
      };
      const first = syncMonetization(client),
        second = syncMonetization(client);
      assert.equal(first, second);
      await first;
      assert.equal(writes.length, 101);
      assert.equal(requests[0].options.excludeEnded, false);
      assert.equal(requests[0].options.excludeDeleted, false);
      assert.equal(requests[0].options.cache, false);
      assert.equal(requests[0].options.skus, undefined);
      assert.equal(requests[1].options.after, firstPage[99].id);
      assert.ok(
        writes
          .slice(0, 100)
          .every((row) => row.value.observedAt === writes[0].value.observedAt),
      );
      assert.ok(writes[100].value.observedAt > writes[0].value.observedAt);
    },
  );

  await t.test(
    "poison records do not block later valid records but fail the scan",
    async () => {
      const { client, application } = setup();
      application.entitlements.fetch = async () =>
        collection([
          entitlement({ applicationId: "999" }),
          entitlement({ id: "523456789012345679" }),
        ]);
      await assert.rejects(syncMonetization(client), /could not be recovered/);
      assert.deepEqual(
        writes.map((row) => row.value.id),
        ["523456789012345679"],
      );
      application.entitlements.fetch = async () => collection([entitlement()]);
      await syncMonetization(client);
      assert.equal(writes.length, 2);
    },
  );

  await t.test(
    "recovery subscriptions are queried for known users and checked against that scope",
    async () => {
      const { client, application, requests } = setup();
      users = [userId];
      application.subscriptions.fetch = async (options) => {
        requests.push({ kind: "subscriptions", options });
        return collection([
          subscription({ userId: "999" }),
          subscription({ id: "623456789012345679" }),
        ]);
      };
      await assert.rejects(syncMonetization(client), /could not be recovered/);
      assert.equal(writes.length, 1);
      assert.equal(writes[0].value.id, "623456789012345679");
      assert.deepEqual(
        requests.find((row) => row.kind === "subscriptions")?.options,
        {
          sku: subSku,
          user: userId,
          after: undefined,
          limit: 100,
          cache: false,
        },
      );
    },
  );

  await t.test(
    "a slow recovery response cannot overwrite a newer live event",
    async () => {
      const { client, application } = setup();
      const started = gate(),
        finish = gate();
      let persisted: RecordValue | undefined;
      application.entitlements.fetch = async () => {
        started.release();
        await finish.promise;
        return collection([entitlement()]);
      };
      write = async (name, value) => {
        if (
          name === "monetization_apply_entitlement" &&
          (!persisted || persisted.observedAt < value.observedAt)
        )
          persisted = value;
      };
      const scan = syncMonetization(client);
      await started.promise;
      await recordEntitlement(client, entitlement({ consumed: true }));
      finish.release();
      await scan;
      assert.equal(persisted?.consumed, true);
      assert.ok(writes[0].value.observedAt > writes[1].value.observedAt);
    },
  );

  await t.test(
    "live recording dispatches after saving and recovery skips already delivered work",
    async () => {
      const { client } = setup();
      await syncMonetization(client);
      rpcCalls = [];
      const row = {
        target_type: "guild",
        target_id: "700",
        operation_id: "operation",
        desired_state: "granted",
        applied_state: "ungranted",
        next_attempt_at: null,
        action_snapshot: {
          grant_action: "grant_tokens",
          remove_action: "remove_tokens",
          grant_settings: {},
        },
      };
      fulfillmentRpc = async (name) => {
        if (name === "monetization_reconcile_fulfillment") return { ...row };
        if (name === "monetization_grant_tokens") row.applied_state = "granted";
        return { ...row };
      };
      await recordEntitlement(client, entitlement({ guildId: "700" }));
      assert.ok(
        rpcCalls.indexOf("monetization_apply_entitlement") <
          rpcCalls.indexOf("monetization_reconcile_fulfillment"),
      );
      assert.ok(
        rpcCalls.indexOf("monetization_reconcile_fulfillment") <
          rpcCalls.indexOf("monetization_grant_tokens"),
      );
      fulfillmentIds = [entitlementId];
      await syncMonetization(client);
      assert.equal(
        rpcCalls.filter((name) => name === "monetization_grant_tokens").length,
        1,
      );
    },
  );

  await t.test(
    "local expiry work is reconciled even when Discord recovery fails",
    async () => {
      const { client, application } = setup();
      fulfillmentIds = [entitlementId];
      application.entitlements.fetch = async () => {
        throw new Error("Discord unavailable");
      };
      fulfillmentRpc = async (name) =>
        name === "monetization_reconcile_fulfillment"
          ? {
              target_type: "guild",
              target_id: "700",
              operation_id: "operation",
              desired_state: "removed",
              applied_state: "granted",
              next_attempt_at: null,
              action_snapshot: {
                grant_action: "grant_features",
                remove_action: "remove_features",
              },
            }
          : null;
      await assert.rejects(syncMonetization(client), /could not be recovered/);
      assert.ok(rpcCalls.includes("monetization_remove_features"));
    },
  );

  await t.test(
    "subscription renewals dispatch the saved linked entitlements",
    async () => {
      const { client } = setup();
      subscriptionEntitlementIds = [entitlementId];
      const reconciled: string[] = [];
      fulfillmentRpc = async (name, args) => {
        if (name !== "monetization_reconcile_fulfillment") return null;
        reconciled.push(args.entitlement);
        return {
          entitlement_id: entitlementId,
          target_type: "guild",
          target_id: "700",
          operation_id: "operation",
          desired_state: "granted",
          applied_state: "granted",
          next_attempt_at: null,
          action_snapshot: {
            grant_action: "grant_plan",
            remove_action: "remove_plan",
            grant_settings: {},
          },
        };
      };
      await recordSubscription(
        client,
        subscription({ entitlementIds: ["999"] }),
      );
      assert.deepEqual(reconciled, [entitlementId]);
      assert.ok(rpcCalls.includes("monetization_grant_plan"));
      assert.ok(
        rpcCalls.indexOf("monetization_apply_subscription") <
          rpcCalls.indexOf("monetization_grant_plan"),
      );
    },
  );

  await t.test(
    "top-up redemption verifies the buyer and saves the guild binding before granting",
    async () => {
      const { client, application } = setup();
      application.entitlements.fetch = (async () =>
        entitlement()) as unknown as typeof application.entitlements.fetch;
      await assert.rejects(
        redeemGuildTopup(client, entitlementId, "999", "700"),
        /buyer/,
      );
      assert.equal(writes.length, 0);
      const row = {
        entitlement_id: entitlementId,
        target_type: "guild",
        target_id: "700",
        operation_id: "operation",
        desired_state: "granted",
        applied_state: "ungranted",
        next_attempt_at: null,
        action_snapshot: {
          grant_action: "grant_tokens",
          remove_action: "remove_tokens",
          grant_settings: { redeem_to_guild: true },
        },
      };
      fulfillmentRpc = async (name, args) => {
        if (name === "monetization_redeem_topup") {
          assert.deepEqual(args, {
            app,
            entitlement: entitlementId,
            buyer: userId,
            guild: "700",
          });
        }
        if (name === "monetization_grant_tokens") row.applied_state = "granted";
        return row;
      };
      let consumes = 0;
      application.entitlements.consume = async () => {
        assert.ok(rpcCalls.includes("monetization_grant_tokens"));
        consumes++;
      };
      await redeemGuildTopup(client, entitlementId, userId, "700");
      assert.equal(consumes, 1);
      assert.ok(
        rpcCalls.indexOf("monetization_redeem_topup") <
          rpcCalls.indexOf("monetization_grant_tokens"),
      );
    },
  );

  await t.test(
    "daily recovery acknowledges consumed top-ups without granting again",
    async () => {
      const { client, application } = setup();
      pendingConsumptionIds = [entitlementId];
      application.entitlements.fetch = (async (options: {
        entitlement?: string;
      }) =>
        options.entitlement
          ? entitlement({ consumed: true })
          : collection([])) as typeof application.entitlements.fetch;
      application.entitlements.consume = async () => {
        throw new Error("Must not consume twice");
      };
      await syncMonetization(client);
      assert.ok(rpcCalls.includes("monetization_record_consumed_purchase"));
      assert.equal(rpcCalls.includes("monetization_grant_tokens"), false);
    },
  );

  await t.test(
    "startup scans once, the timer runs daily, and shutdown drains accepted work",
    async () => {
      const { client, application } = setup();
      let scans = 0;
      application.entitlements.fetch = async () => {
        scans++;
        return collection([]);
      };
      const originalSet = globalThis.setInterval,
        originalClear = globalThis.clearInterval;
      let tick!: () => void,
        interval = 0,
        schedules = 0,
        cleared = false;
      const fakeTimer = { unref() {} } as NodeJS.Timeout;
      globalThis.setInterval = ((callback: () => void, delay: number) => {
        schedules++;
        tick = callback;
        interval = delay;
        return fakeTimer;
      }) as typeof setInterval;
      globalThis.clearInterval = ((timer: NodeJS.Timeout) => {
        assert.equal(timer, fakeTimer);
        cleared = true;
      }) as typeof clearInterval;
      try {
        startDiscordMonetization(client);
        startDiscordMonetization(client);
        await syncMonetization(client);
        assert.equal(scans, 1);
        assert.equal(schedules, 1);
        assert.equal(interval, 24 * 60 * 60 * 1000);
        tick();
        await syncMonetization(client);
        assert.equal(scans, 2);
        const started = gate(),
          finish = gate();
        write = async () => {
          started.release();
          await finish.promise;
        };
        const accepted = recordEntitlement(client, entitlement());
        await started.promise;
        const drain = keyedQueue.stop();
        await stopDiscordMonetization();
        assert.equal(cleared, true);
        await assert.rejects(
          recordEntitlement(client, entitlement()),
          /stopped/i,
        );
        await syncMonetization(client);
        assert.equal(scans, 2);
        finish.release();
        await Promise.all([accepted, drain]);
        assert.equal(writes.length, 1);
      } finally {
        globalThis.setInterval = originalSet;
        globalThis.clearInterval = originalClear;
      }
    },
  );
});
