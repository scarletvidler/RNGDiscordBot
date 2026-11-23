import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const app = "100";
const config = {
  application_id: app,
  sku_id: "200",
  enabled: true,
  mode: "while_active",
  grant_action: "grant_features",
  grant_settings: { features: ["emotion_tags"] },
  remove_action: "remove_features",
  remove_settings: {},
  effective_from: "2020-01-01T00:00:00Z",
};

test("guild fulfillment preparation, lifecycle and recovery remain durable", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table public.discord_users(id text primary key,username text not null);
    create table public.guilds(id text primary key,token_limit integer not null default 5000,
      token_total_usage integer not null default 0,token_balance integer not null default 5000);
    insert into public.guilds(id) values('400');
    alter default privileges grant execute on functions to anon,authenticated,service_role;`);
  for (const file of [
    "20261107000000_discord_monetization_records.sql",
    "20261107010000_remove_monetization_financial_records.sql",
    "20261112000000_shared_supabase_monetization.sql",
    "20261112010000_sku_fulfillment_state.sql",
    "20261114000000_fulfillment_actions.sql",
    "20261115000000_token_fulfillment_actions.sql",
    "20261115010000_guild_fulfillment_dispatch.sql",
  ])
    await db.exec(
      await readFile(
        new URL(`../../supabase/migrations/${file}`, import.meta.url),
        "utf8",
      ),
    );
  async function rpc(name: string, args: unknown[]) {
    await db.exec("set role service_role");
    return (
      await db.query<{ result: any }>(
        `select public.${name}(${args.map((_, i) => `$${i + 1}`).join(",")}) as result`,
        args.map((v) =>
          v !== null && typeof v === "object" ? JSON.stringify(v) : v,
        ),
      )
    ).rows[0]?.result;
  }
  let observed = Date.now();
  async function record(id: string, extra = {}) {
    return rpc("monetization_apply_entitlement", [
      {
        applicationId: app,
        id,
        skuId: "200",
        userId: "300",
        guildId: "400",
        type: 1,
        startsAt: null,
        endsAt: null,
        consumed: false,
        deleted: false,
        createdAt: "2026-01-01T00:00:00Z",
        observedAt: new Date(++observed).toISOString(),
        ...extra,
      },
    ]);
  }
  const configure = (extra = {}) =>
    rpc("monetization_upsert_sku_action", [{ ...config, ...extra }]);
  const state = (id: string) =>
    rpc("monetization_get_purchase_fulfillment", [app, id]);
  const reconcile = (id: string) =>
    rpc("monetization_reconcile_fulfillment", [app, id]);
  await rpc("monetization_upsert_skus", [
    [
      {
        applicationId: app,
        id: "200",
        name: "Features",
        type: 2,
        flags: 4,
        observedAt: new Date().toISOString(),
      },
    ],
  ]);

  await t.test(
    "recording atomically creates canonical guild work and retains user-only purchases",
    async () => {
      await configure();
      await record("600");
      const f = await state("600");
      assert.equal(f.target_type, "guild");
      assert.equal(f.target_id, "400");
      assert.equal(f.processing_status, "pending");
      assert.deepEqual(
        await rpc("monetization_create_purchase_fulfillment", [app, "600"]),
        f,
      );
      await assert.rejects(
        rpc("monetization_create_purchase_fulfillment", [
          app,
          "600",
          "guild",
          "401",
        ]),
        /entitlement guild/,
      );
      await assert.rejects(
        rpc("monetization_create_purchase_fulfillment", [
          app,
          "600",
          "user",
          "300",
        ]),
        /entitlement guild/,
      );
      await record("601", { guildId: null });
      assert.equal(await state("601"), null);
      assert.equal(await reconcile("601"), null);
      await db.exec("reset role");
      assert.equal(
        (
          await db.query(
            "select * from monetization.one_time_purchases where id='601'",
          )
        ).rows.length,
        1,
      );
      await db.exec(`create function public.reject_preparation() returns trigger language plpgsql as $$
      begin if new.entitlement_id='602' then raise exception 'preparation failed'; end if; return new; end $$;
      create trigger reject_preparation before insert on monetization.purchase_fulfillments for each row execute function public.reject_preparation();`);
      await assert.rejects(record("602"), /preparation failed/);
      await db.exec("reset role");
      assert.equal(
        (
          await db.query(
            "select * from monetization.entitlements where id='602'",
          )
        ).rows.length,
        0,
      );
      assert.equal(
        (
          await db.query(
            "select * from monetization.one_time_purchases where id='602'",
          )
        ).rows.length,
        0,
      );
      await db.exec(
        "drop trigger reject_preparation on monetization.purchase_fulfillments; drop function public.reject_preparation()",
      );
    },
  );

  await t.test(
    "disabled and future work can be recovered from saved guild entitlements",
    async () => {
      await configure({ enabled: false });
      await record("610");
      assert.equal(await state("610"), null);
      await configure();
      assert.equal((await reconcile("610")).processing_status, "pending");
      await record("611", { startsAt: "2099-01-01T00:00:00Z" });
      assert.equal(await state("611"), null);
      await record("611");
      assert.equal((await state("611")).target_id, "400");
      const ids = await rpc("monetization_fulfillment_entitlements", [
        app,
        null,
        2,
      ]);
      assert.deepEqual(ids, ["600", "610"]);
      assert.deepEqual(
        await rpc("monetization_fulfillment_entitlements", [app, "610", 2]),
        ["611"],
      );
      assert.deepEqual(
        await rpc("monetization_fulfillment_entitlements", ["101", null, 2]),
        [],
      );
      await assert.rejects(
        rpc("monetization_fulfillment_entitlements", [app, null, 101]),
        /page size/,
      );
    },
  );

  await t.test(
    "deletion and expiry queue removal while consumption preserves delivered tokens",
    async () => {
      await configure();
      await record("620");
      await rpc("monetization_grant_features", [app, "620"]);
      assert.deepEqual(
        await rpc("monetization_get_granted_features", [app, "guild", "400"]),
        ["emotion_tags"],
      );
      // Time alone can expire an entitlement between Discord events.
      await db.exec(
        "reset role; update monetization.entitlements set ends_at=now()-interval '1 second' where id='620'",
      );
      assert.deepEqual(
        await rpc("monetization_get_granted_features", [app, "guild", "400"]),
        [],
      );
      const old = await state("620");
      const expired = await reconcile("620");
      assert.equal(expired.desired_state, "removed");
      assert.notEqual(expired.operation_id, old.operation_id);
      await rpc("monetization_remove_features", [app, "620"]);
      await record("620");
      assert.equal((await reconcile("620")).applied_state, "removed");
      await configure({
        mode: "once",
        grant_action: "grant_tokens",
        grant_settings: { quantity: 1000 },
        remove_action: "remove_tokens",
      });
      await record("621");
      await rpc("monetization_grant_tokens", [app, "621"]);
      await record("621", { consumed: true, endsAt: "2020-01-01T00:00:00Z" });
      assert.equal((await state("621")).desired_state, "granted");
      await record("621", { deleted: true });
      assert.equal((await state("621")).desired_state, "removed");
      await record("622");
      await record("622", { consumed: true });
      assert.equal((await state("622")).desired_state, "removed");
      await rpc("monetization_remove_tokens", [app, "622"]);
      assert.equal((await state("622")).granted_at, null);
      await record("623");
      await record("623", { endsAt: "2020-01-01T00:00:00Z" });
      assert.equal((await state("623")).desired_state, "removed");
    },
  );

  await t.test(
    "failure metadata is bounded and cannot overwrite completed or newer work",
    async () => {
      await configure();
      await record("630");
      const f = await state("630");
      await rpc("monetization_fulfillment_failure", [
        app,
        "630",
        f.operation_id,
        "handler_failed",
      ]);
      const failed = await state("630");
      assert.equal(failed.processing_status, "failed");
      assert.equal(failed.attempt_count, 1);
      assert.ok(failed.next_attempt_at);
      assert.deepEqual(await reconcile("630"), failed);
      await record("630", { deleted: true });
      const removal = await state("630");
      assert.equal(removal.next_attempt_at, null);
      assert.notEqual(removal.operation_id, f.operation_id);
      await rpc("monetization_fulfillment_failure", [
        app,
        "630",
        f.operation_id,
        "unsupported_action",
      ]);
      assert.deepEqual(await state("630"), removal);
      await rpc("monetization_remove_features", [app, "630"]);
      const done = await state("630");
      await rpc("monetization_fulfillment_failure", [
        app,
        "630",
        removal.operation_id,
        "handler_failed",
      ]);
      assert.deepEqual(await state("630"), done);
      await assert.rejects(
        rpc("monetization_fulfillment_failure", [
          app,
          "630",
          removal.operation_id,
          "raw private text",
        ]),
        /error code/,
      );
    },
  );

  await t.test(
    "none actions finish safely and legacy personal grants cannot be newly delivered",
    async () => {
      await configure({
        grant_action: "none",
        grant_settings: {},
        remove_action: "none",
      });
      await record("640");
      const granted = await rpc("monetization_complete_noop_fulfillment", [
        app,
        "640",
      ]);
      assert.equal(granted.applied_state, "granted");
      assert.deepEqual(
        await rpc("monetization_complete_noop_fulfillment", [app, "640"]),
        granted,
      );
      await record("640", { deleted: true });
      assert.equal(
        (await rpc("monetization_complete_noop_fulfillment", [app, "640"]))
          .applied_state,
        "removed",
      );
      await configure();
      await record("641");
      await assert.rejects(
        rpc("monetization_complete_noop_fulfillment", [app, "641"]),
        /not none/,
      );
      await record("642", { guildId: null });
      await db.exec(`reset role; insert into monetization.purchase_fulfillments(application_id,entitlement_id,sku_id,config_version,action_snapshot,target_type,target_id,processing_status)
      select '100','642','200',version,jsonb_build_object('mode',mode,'grant_action',grant_action,'grant_settings',grant_settings,'remove_action',remove_action,'remove_settings',remove_settings),'user','300','pending' from monetization.sku_actions where application_id='100' and sku_id='200'`);
      await assert.rejects(
        rpc("monetization_grant_features", [app, "642"]),
        /entitlement guild/,
      );
      assert.equal(await reconcile("642"), null);
      await assert.rejects(
        rpc("monetization_get_granted_features", [app, "user", "300"]),
        /recipient/,
      );
    },
  );

  await t.test("only service RPCs are accessible", async () => {
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      for (const sql of [
        "select public.monetization_reconcile_fulfillment('100','600')",
        "select public.monetization_fulfillment_entitlements('100')",
        "select public.monetization_complete_noop_fulfillment('100','640')",
        "select public.monetization_fulfillment_failure('100','640','00000000-0000-0000-0000-000000000000','handler_failed')",
      ])
        await assert.rejects(db.query(sql), /permission denied/);
    }
    await db.exec("set role service_role");
    for (const sql of [
      "select monetization.reconcile_fulfillment('100','600')",
      "select monetization.apply_feature_action_before_guild_only('100','642',false)",
    ])
      await assert.rejects(db.query(sql), /permission denied/);
  });
});
