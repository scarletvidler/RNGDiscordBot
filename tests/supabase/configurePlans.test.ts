import assert from "node:assert/strict";
import { test } from "node:test";
import { getSupabaseAdmin } from "../../supabase/client.ts";
import {
  buildPlanActions,
  configurePlans,
  parsePlanOptions,
  type ConfigurePlanOptions,
} from "../../supabase/configurePlans.ts";

const base: ConfigurePlanOptions = {
  applicationId: "100",
  effectiveFrom: "2026-12-01T00:00:00Z",
  enable: false,
  apply: false,
  replace: false,
};

test("plan configuration requires explicit identities and a launch cutoff", () => {
  assert.throws(() => parsePlanOptions([]), /--app and --effective-from/);
  assert.throws(() => buildPlanActions(base), /at least one/);
  assert.throws(
    () => buildPlanActions({ ...base, starter: "put-your-id-here" }),
    /snowflake/,
  );
  assert.throws(
    () => buildPlanActions({ ...base, starter: "200", basic: "200" }),
    /different SKU/,
  );
  assert.throws(
    () =>
      buildPlanActions({ ...base, starter: "200", effectiveFrom: "tomorrow" }),
    /UTC timestamp/,
  );
  assert.throws(
    () =>
      buildPlanActions({
        ...base,
        starter: "200",
        effectiveFrom: "2026-02-30T00:00:00Z",
      }),
    /valid calendar/,
  );
  assert.throws(
    () => buildPlanActions({ ...base, topup: "300" }),
    /positive whole/,
  );
  assert.throws(
    () => buildPlanActions({ ...base, topup: "300", quantity: 1.5 }),
    /positive whole/,
  );
  assert.throws(
    () => buildPlanActions({ ...base, starter: "200", quantity: 100 }),
    /only used with/,
  );
});

test("plan templates retain monthly allowances and one-month Plus rollover", () => {
  const actions = buildPlanActions({
    ...base,
    starter: "200",
    basic: "201",
    plus: "202",
    topup: "203",
    quantity: 10000,
  });
  assert.deepEqual(
    actions.slice(0, 3).map((action) => action.grant_settings.quantity),
    [15000, 35000, 70000],
  );
  assert.deepEqual(
    actions.slice(0, 3).map((action) => action.grant_settings.rollover_months),
    [0, 0, 1],
  );
  assert.deepEqual(actions[2].grant_settings.features, [
    "emotion_tags",
    "voice_selection",
    "higher_voice_modules",
  ]);
  assert.ok(actions.every((action) => action.enabled === false));
  assert.ok(
    actions.every(
      (action) => action.effective_from === "2026-12-01T00:00:00.000Z",
    ),
  );
  assert.equal(actions[2].grant_action, "grant_plan");
  assert.equal(actions[2].remove_action, "remove_plan");
  assert.equal(actions[3].mode, "once");
  assert.deepEqual(actions[3].grant_settings, {
    quantity: 10000,
    redeem_to_guild: true,
  });
  assert.equal(actions[3].remove_action, "remove_tokens");
});

test("configuration previews without writes and validates all SKUs before applying", async (t) => {
  const oldUrl = process.env.SUPABASE_URL;
  const oldKey = process.env.SUPABASE_SECRET_KEY;
  const oldClientId = process.env.CLIENT_ID;
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SECRET_KEY = "test-secret";
  process.env.CLIENT_ID = "100";
  const db = getSupabaseAdmin()!;
  const originalRpc = db.rpc;
  const calls: { name: string; args: Record<string, any> }[] = [];
  const catalog = new Map([
    [
      "200",
      {
        application_id: "100",
        id: "200",
        name: "Starter",
        type: 5,
        flags: 128,
      },
    ],
    [
      "201",
      { application_id: "100", id: "201", name: "Basic", type: 5, flags: 128 },
    ],
    [
      "203",
      { application_id: "100", id: "203", name: "Top-up", type: 3, flags: 4 },
    ],
  ]);
  let existing: unknown = null;
  db.rpc = ((name: string, args: Record<string, any>) => ({
    abortSignal(signal: AbortSignal) {
      assert.ok(signal instanceof AbortSignal);
      calls.push({ name, args });
      if (name === "monetization_get_sku")
        return Promise.resolve({
          data: catalog.get(args.sku) ?? null,
          error: null,
        });
      if (name === "monetization_get_sku_action")
        return Promise.resolve({ data: existing, error: null });
      assert.equal(name, "monetization_upsert_sku_action");
      return Promise.resolve({ data: args.r, error: null });
    },
  })) as unknown as typeof db.rpc;
  t.after(() => {
    db.rpc = originalRpc;
    if (oldUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_SECRET_KEY;
    else process.env.SUPABASE_SECRET_KEY = oldKey;
    if (oldClientId === undefined) delete process.env.CLIENT_ID;
    else process.env.CLIENT_ID = oldClientId;
  });

  const preview = await configurePlans({ ...base, starter: "200" });
  assert.equal(preview[0].next.enabled, false);
  assert.equal(
    calls.filter((call) => call.name === "monetization_upsert_sku_action")
      .length,
    0,
  );

  await assert.rejects(
    configurePlans({ ...base, starter: "200", basic: "999", apply: true }),
    /not imported/,
  );
  assert.equal(
    calls.filter((call) => call.name === "monetization_upsert_sku_action")
      .length,
    0,
  );
  await assert.rejects(
    configurePlans({ ...base, starter: "203", apply: true }),
    /guild subscription/,
  );
  await assert.rejects(
    configurePlans({ ...base, topup: "200", quantity: 100, apply: true }),
    /consumable/,
  );
  catalog.get("201")!.flags = 256;
  await assert.rejects(
    configurePlans({ ...base, basic: "201" }),
    /guild subscription/,
  );
  await assert.rejects(
    configurePlans({ ...base, starter: "200", applicationId: "101" }),
    /CLIENT_ID/,
  );

  existing = { grant_action: "none", effective_from: "2026-11-01T00:00:00Z" };
  const replacementPreview = await configurePlans({ ...base, starter: "200" });
  assert.deepEqual(replacementPreview[0].previous, existing);
  await assert.rejects(
    configurePlans({ ...base, starter: "200", apply: true }),
    /--replace/,
  );
  assert.equal(
    calls.filter((call) => call.name === "monetization_upsert_sku_action")
      .length,
    0,
  );
  const saved = await configurePlans({
    ...base,
    starter: "200",
    apply: true,
    replace: true,
    enable: true,
  });
  assert.equal(saved[0].next.enabled, true);
  const writes = calls.filter(
    (call) => call.name === "monetization_upsert_sku_action",
  );
  assert.equal(writes.length, 1);
  assert.equal(writes[0].args.r.sku_id, "200");
  assert.equal(writes[0].args.r.effective_from, "2026-12-01T00:00:00.000Z");
});
