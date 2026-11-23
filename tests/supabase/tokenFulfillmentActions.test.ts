import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const app = "100";
const sku = "200";
const configuration = {
  application_id: app,
  sku_id: sku,
  enabled: true,
  mode: "once",
  grant_action: "grant_tokens",
  grant_settings: { quantity: 10000 },
  remove_action: "remove_tokens",
  remove_settings: {},
  effective_from: "2020-01-01T00:00:00.000Z",
};

test("token actions update guild allowance and fulfillment atomically", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table public.discord_users(id text primary key, username text not null);
    create table public.guilds(id text primary key, token_limit integer not null default 5000,
      token_total_usage integer not null default 0, token_balance integer not null default 0);
    insert into public.guilds(id,token_total_usage,token_balance) values('400',1000,4000);
    alter default privileges grant execute on functions to anon, authenticated, service_role;
  `);
  for (const file of [
    "20261107000000_discord_monetization_records.sql",
    "20261107010000_remove_monetization_financial_records.sql",
    "20261112000000_shared_supabase_monetization.sql",
    "20261112010000_sku_fulfillment_state.sql",
    "20261114000000_fulfillment_actions.sql",
    "20261115000000_token_fulfillment_actions.sql",
  ]) {
    await db.exec(
      await readFile(
        new URL(`../../supabase/migrations/${file}`, import.meta.url),
        "utf8",
      ),
    );
  }
  async function rpc(name: string, args: unknown[]) {
    await db.exec("set role service_role");
    const placeholders = args.map((_, i) => `$${i + 1}`).join(",");
    const result = await db.query<{ result: any }>(
      `select public.${name}(${placeholders}) as result`,
      args.map((value) =>
        value !== null && typeof value === "object"
          ? JSON.stringify(value)
          : value,
      ),
    );
    return result.rows[0]?.result;
  }
  let observation = Date.now();
  async function record(id: string, extra = {}) {
    await rpc("monetization_apply_entitlement", [
      {
        applicationId: app,
        id,
        skuId: sku,
        userId: "300",
        guildId: "400",
        type: 1,
        startsAt: null,
        endsAt: null,
        consumed: false,
        deleted: false,
        createdAt: "2026-01-01T00:00:00.000Z",
        observedAt: new Date(++observation).toISOString(),
        ...extra,
      },
    ]);
  }
  async function configure(extra = {}) {
    return rpc("monetization_upsert_sku_action", [
      { ...configuration, ...extra },
    ]);
  }
  async function prepare(
    id: string,
    targetType: string | null = "guild",
    targetId: string | null = "400",
  ) {
    await record(id, { guildId: targetType === "guild" ? targetId : "400" });
    return rpc("monetization_create_purchase_fulfillment", [
      app,
      id,
      targetType,
      targetId,
    ]);
  }
  const grant = (id: string) => rpc("monetization_grant_tokens", [app, id]);
  const remove = (id: string) => rpc("monetization_remove_tokens", [app, id]);
  const state = (id: string) =>
    rpc("monetization_get_purchase_fulfillment", [app, id]);
  async function guild(id = "400") {
    await db.exec("reset role");
    return (
      await db.query<{
        token_limit: number;
        token_total_usage: number;
        token_balance: number;
      }>(
        "select token_limit,token_total_usage,token_balance from public.guilds where id=$1",
        [id],
      )
    ).rows[0];
  }
  await rpc("monetization_upsert_skus", [
    [
      {
        applicationId: app,
        id: sku,
        name: "Tokens",
        type: 3,
        flags: 4,
        observedAt: new Date().toISOString(),
      },
    ],
  ]);

  await t.test(
    "grants add saved quantity once and retain existing usage",
    async () => {
      await configure();
      const prepared = await prepare("600");
      await configure({ grant_settings: { quantity: 20000 }, enabled: false });
      const granted = await grant("600");
      assert.equal(granted.applied_state, "granted");
      assert.equal(granted.processing_status, "succeeded");
      assert.equal(granted.attempt_count, 1);
      assert.equal(granted.operation_id, prepared.operation_id);
      assert.ok(granted.granted_at);
      assert.deepEqual(granted.grant_result, { quantity: 10000 });
      assert.deepEqual(await guild(), {
        token_limit: 15000,
        token_total_usage: 1000,
        token_balance: 14000,
      });
      assert.deepEqual(await grant("600"), granted);
      assert.equal((await guild()).token_limit, 15000);
    },
  );

  await t.test(
    "separate grants add together and removal subtracts original amount after usage",
    async () => {
      await configure({ grant_settings: { quantity: 2000 } });
      await prepare("601");
      await grant("601");
      assert.equal((await guild()).token_limit, 17000);
      await db.exec(
        "reset role; update public.guilds set token_total_usage=16000,token_balance=1000 where id='400'",
      );
      const removed = await remove("600");
      assert.equal(removed.applied_state, "removed");
      assert.equal(removed.desired_state, "removed");
      assert.equal(removed.processing_status, "succeeded");
      assert.equal(removed.attempt_count, 2);
      assert.ok(removed.removed_at);
      assert.deepEqual(removed.grant_result, { quantity: 10000 });
      assert.deepEqual(await guild(), {
        token_limit: 7000,
        token_total_usage: 16000,
        token_balance: 0,
      });
      assert.deepEqual(await remove("600"), removed);
      assert.equal((await guild()).token_limit, 7000);
      await assert.rejects(grant("600"), /removed/i);
      await remove("601");
      assert.deepEqual(await guild(), {
        token_limit: 5000,
        token_total_usage: 16000,
        token_balance: 0,
      });
    },
  );

  await t.test(
    "full reversal can leave a negative allowance after an external edit",
    async () => {
      await db.exec(
        "reset role; insert into public.guilds(id,token_total_usage) values('404',2000)",
      );
      await configure();
      await prepare("604", "guild", "404");
      await grant("604");
      await db.exec(
        "reset role; update public.guilds set token_limit=3000 where id='404'",
      );
      await remove("604");
      assert.deepEqual(await guild("404"), {
        token_limit: -7000,
        token_total_usage: 2000,
        token_balance: 0,
      });
    },
  );

  await t.test(
    "removal before grant never deducts and prevents late grants",
    async () => {
      await configure();
      await prepare("602", null, null);
      const before = await guild();
      const removed = await remove("602");
      assert.equal(removed.applied_state, "removed");
      assert.equal(removed.granted_at, null);
      assert.equal(removed.grant_result, null);
      assert.deepEqual(await guild(), before);
      assert.deepEqual(await remove("602"), removed);
      await assert.rejects(grant("602"), /removed/i);
    },
  );

  await t.test(
    "invalid quantities do not change allowance or completion",
    async () => {
      const quantities = [
        undefined,
        null,
        "10000",
        0,
        -1,
        1.5,
        true,
        {},
        [],
        2147483648,
      ];
      for (const [index, quantity] of quantities.entries()) {
        await configure({
          grant_settings: quantity === undefined ? {} : { quantity },
        });
        const id = String(610 + index);
        const prepared = await prepare(id);
        const before = await guild();
        await assert.rejects(grant(id));
        assert.deepEqual(await state(id), prepared);
        assert.deepEqual(await guild(), before);
      }
    },
  );

  await t.test(
    "valid integer boundary and overflow preserve transactional behavior",
    async () => {
      await db.exec(
        "reset role; insert into public.guilds(id,token_limit) values('401',0),('402',1)",
      );
      await configure({ grant_settings: { quantity: 2147483647 } });
      await prepare("630", "guild", "401");
      await grant("630");
      assert.equal((await guild("401")).token_limit, 2147483647);
      await remove("630");
      assert.equal((await guild("401")).token_limit, 0);
      const prepared = await prepare("631", "guild", "402");
      await assert.rejects(grant("631"), /out of range|overflow/i);
      assert.deepEqual(await state("631"), prepared);
      assert.deepEqual(await guild("402"), {
        token_limit: 1,
        token_total_usage: 0,
        token_balance: 0,
      });
    },
  );

  await t.test(
    "unknown, unresolved and user recipients cannot receive guild tokens",
    async () => {
      await configure();
      for (const [id, targetType, targetId] of [
        ["640", null, null],
        ["641", "user", "300"],
        ["642", "guild", "499"],
      ]) {
        const prepared = await prepare(id!, targetType, targetId);
        const before = await guild();
        await assert.rejects(grant(id!));
        assert.deepEqual(await state(id!), prepared);
        assert.deepEqual(await guild(), before);
      }
    },
  );

  await t.test(
    "changed eligibility and wrong actions reject without effects",
    async () => {
      await configure();
      for (const [index, extra] of [
        { deleted: true },
        { consumed: true },
        { startsAt: "2099-01-01T00:00:00Z" },
        { endsAt: "2020-01-01T00:00:00Z" },
      ].entries()) {
        const id = String(650 + index);
        const prepared = await prepare(id);
        await record(id, extra);
        await assert.rejects(grant(id), /eligible/i);
        assert.deepEqual(await state(id), prepared);
      }
      await configure({ grant_action: "grant_features" });
      const prepared = await prepare("654");
      await assert.rejects(grant("654"), /handler|action/i);
      await assert.rejects(remove("654"), /handler|action/i);
      assert.deepEqual(await state("654"), prepared);
      await assert.rejects(grant("999"), /Entitlement not found/);
      await record("655");
      await assert.rejects(grant("655"), /Fulfillment not found/);
    },
  );

  await t.test(
    "failed removal after guild deletion retains the original successful grant",
    async () => {
      await db.exec("reset role; insert into public.guilds(id) values('403')");
      await configure();
      await prepare("660", "guild", "403");
      const granted = await grant("660");
      await db.exec("reset role; delete from public.guilds where id='403'");
      await assert.rejects(remove("660"), /guild/i);
      assert.deepEqual(await state("660"), granted);
    },
  );

  await t.test(
    "failures while saving completion roll back the token change",
    async () => {
      await configure();
      const prepared = await prepare("670");
      const before = await guild();
      await db.exec(`
      create function public.reject_token_completion() returns trigger language plpgsql as $$
      begin if new.entitlement_id='670' then raise exception 'test completion failure'; end if; return new; end $$;
      create trigger reject_token_completion before update on monetization.purchase_fulfillments
      for each row execute function public.reject_token_completion();
    `);
      await assert.rejects(grant("670"), /test completion failure/);
      assert.deepEqual(await state("670"), prepared);
      assert.deepEqual(await guild(), before);
      await db.exec(
        "drop trigger reject_token_completion on monetization.purchase_fulfillments; drop function public.reject_token_completion()",
      );
    },
  );

  await t.test(
    "anonymous and authenticated callers cannot execute token actions",
    async () => {
      for (const role of ["anon", "authenticated"]) {
        await db.exec(`set role ${role}`);
        for (const query of [
          "select public.monetization_grant_tokens('100','600')",
          "select public.monetization_remove_tokens('100','600')",
        ])
          await assert.rejects(db.query(query), /permission denied/);
      }
      for (const role of ["anon", "authenticated", "service_role"]) {
        await db.exec(`set role ${role}`);
        await assert.rejects(
          db.query("select monetization.apply_token_action('100','600',false)"),
          /permission denied/,
        );
      }
    },
  );
});
