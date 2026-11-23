import assert from "node:assert/strict";
import { test } from "node:test";
import type { Client } from "discord.js";
import { getSupabaseAdmin } from "../../../supabase/client.ts";
import { dispatchFulfillment } from "../../../bot/modules/fulfillment.ts";
import { guildHasFeature } from "../../../bot/modules/featureCheck.ts";

test("fulfillment dispatcher uses saved actions and records bounded failure metadata", async (t) => {
  const oldUrl = process.env.SUPABASE_URL;
  const oldKey = process.env.SUPABASE_SECRET_KEY;
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SECRET_KEY = "test-secret";
  const db = getSupabaseAdmin()!;
  const originalRpc = db.rpc;
  const client = {} as Client;
  const initial = () => ({
    entitlement_id: "600",
    target_type: "guild",
    target_id: "700",
    operation_id: "saved-operation",
    desired_state: "granted",
    applied_state: "ungranted",
    next_attempt_at: null as string | null,
    action_snapshot: {
      grant_action: "grant_tokens",
      remove_action: "remove_tokens",
      grant_settings: {} as Record<string, unknown>,
    },
  });
  let row: ReturnType<typeof initial> | null = initial();
  let calls: Array<{ name: string; args: any }> = [];
  let errorOn = "";
  let features: string[] = ["emotions"];
  const handlerError = new Error("private SQL payload must not be persisted");
  db.rpc = ((name: string, args: any) => ({
    abortSignal: async () => {
      calls.push({ name, args });
      if (name === errorOn) return { data: null, error: handlerError };
      if (name === "monetization_reconcile_fulfillment")
        return { data: row, error: null };
      if (name === "monetization_get_granted_features")
        return { data: features, error: null };
      return { data: row, error: null };
    },
  })) as unknown as typeof db.rpc;
  t.after(() => {
    db.rpc = originalRpc;
    if (oldUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = oldKey;
  });
  const dispatch = () => dispatchFulfillment(client, "100", "600");
  const reset = () => {
    row = initial();
    calls = [];
    errorOn = "";
  };

  await t.test(
    "selects all grant/removal functions and refreshes features",
    async () => {
      for (const [action, removing, rpc] of [
        ["grant_tokens", false, "monetization_grant_tokens"],
        ["grant_features", false, "monetization_grant_features"],
        ["grant_plan", false, "monetization_grant_plan"],
        ["remove_tokens", true, "monetization_remove_tokens"],
        ["remove_features", true, "monetization_remove_features"],
        ["remove_plan", true, "monetization_remove_plan"],
        ["none", false, "monetization_complete_noop_fulfillment"],
        ["none", true, "monetization_complete_noop_fulfillment"],
      ] as const) {
        reset();
        if (removing) {
          row!.desired_state = "removed";
          row!.applied_state = "granted";
          row!.action_snapshot.remove_action = action;
        } else row!.action_snapshot.grant_action = action;
        await dispatch();
        assert.deepEqual(
          calls.map((x) => x.name),
          [
            "monetization_reconcile_fulfillment",
            rpc,
            "monetization_get_granted_features",
          ],
        );
        assert.deepEqual(calls[1].args, { app: "100", entitlement: "600" });
        assert.equal(await guildHasFeature("100", "700", "emotions"), true);
      }
      features = [];
      await dispatch();
      assert.equal(await guildHasFeature("100", "700", "emotions"), false);
    },
  );

  await t.test(
    "ignores absent, personal, completed and delayed work",
    async () => {
      for (const change of [
        () => {
          row = null;
        },
        () => {
          row!.target_type = "user";
        },
        () => {
          row!.target_id = "";
        },
        () => {
          row!.applied_state = "granted";
        },
        () => {
          row!.next_attempt_at = new Date(Date.now() + 86400000).toISOString();
        },
      ]) {
        reset();
        change();
        await dispatch();
        assert.deepEqual(
          calls.map((x) => x.name),
          ["monetization_reconcile_fulfillment"],
        );
      }
    },
  );

  await t.test(
    "revisits an already granted plan so the database can grant a new billing period",
    async () => {
      reset();
      row!.applied_state = "granted";
      row!.action_snapshot.grant_action = "grant_plan";
      await dispatch();
      assert.deepEqual(
        calls.map((call) => call.name),
        [
          "monetization_reconcile_fulfillment",
          "monetization_grant_plan",
          "monetization_get_granted_features",
        ],
      );
    },
  );

  await t.test(
    "failures retain operation identity but never persist raw errors",
    async () => {
      reset();
      errorOn = "monetization_grant_tokens";
      await assert.rejects(dispatch(), (value) => value === handlerError);
      assert.deepEqual(calls.at(-1), {
        name: "monetization_fulfillment_failure",
        args: {
          app: "100",
          entitlement: "600",
          operation: "saved-operation",
          error_code: "handler_failed",
        },
      });
      reset();
      row!.action_snapshot.grant_action = "arbitrary_module";
      await assert.rejects(dispatch(), /Unsupported/);
      assert.equal(calls.at(-1)?.args.error_code, "unsupported_action");
      assert.equal(calls.length, 2);
    },
  );

  await t.test(
    "rejects a removal action during a grant and a grant action during removal",
    async () => {
      for (const removing of [false, true]) {
        reset();
        if (removing) {
          row!.desired_state = "removed";
          row!.applied_state = "granted";
          row!.action_snapshot.remove_action = "grant_features";
        } else {
          row!.action_snapshot.grant_action = "remove_tokens";
        }

        await assert.rejects(dispatch(), /Unsupported/);
        assert.deepEqual(
          calls.map((call) => call.name),
          [
            "monetization_reconcile_fulfillment",
            "monetization_fulfillment_failure",
          ],
        );
        assert.equal(calls.at(-1)?.args.error_code, "unsupported_action");
      }
    },
  );

  await t.test(
    "removal intent invalidates granted access even when cleanup fails or waits",
    async () => {
      for (const delayed of [false, true]) {
        reset();
        features = ["emotions"];
        await dispatch();
        assert.equal(await guildHasFeature("100", "700", "emotions"), true);
        row!.desired_state = "removed";
        row!.applied_state = "granted";
        row!.action_snapshot.remove_action = "remove_features";
        features = [];
        calls = [];
        if (delayed) {
          row!.next_attempt_at = new Date(Date.now() + 86400000).toISOString();
          await dispatch();
          assert.deepEqual(
            calls.map((call) => call.name),
            ["monetization_reconcile_fulfillment"],
          );
        } else {
          errorOn = "monetization_remove_features";
          await assert.rejects(dispatch(), (value) => value === handlerError);
        }
        assert.equal(await guildHasFeature("100", "700", "emotions"), false);
        assert.equal(calls.at(-1)?.name, "monetization_get_granted_features");
      }
    },
  );

  await t.test(
    "cache failure after success is not recorded as an action failure",
    async () => {
      reset();
      errorOn = "monetization_get_granted_features";
      const previousError = console.error;
      const logs: string[] = [];
      console.error = (value) => logs.push(String(value));
      try {
        await dispatch();
      } finally {
        console.error = previousError;
      }
      assert.equal(
        calls.some((x) => x.name === "monetization_fulfillment_failure"),
        false,
      );
      assert.equal(logs.length, 1);
      assert.equal(logs[0].includes("private SQL"), false);
      assert.equal(await guildHasFeature("100", "700", "emotions"), false);
    },
  );
});
