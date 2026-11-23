import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("token conversion rates are seeded and only service RPC callers can read them", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(
    "create schema monetization; create role anon; create role authenticated; create role service_role;",
  );
  await db.exec(
    await readFile(
      new URL(
        "../../supabase/migrations/20261123010000_token_rates.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec("set role service_role");
  const result = await db.query<{
    rate: {
      unit: string;
      tokens_numerator: number;
      tokens_denominator: number;
    };
  }>("select public.monetization_get_token_rate('fish','s2.1-pro') as rate");
  assert.equal(result.rows[0].rate.unit, "utf8_bytes");
  assert.equal(result.rows[0].rate.tokens_numerator, 15);
  assert.equal(result.rows[0].rate.tokens_denominator, 182);
  await assert.rejects(
    db.query("select * from monetization.token_rates"),
    /permission denied/,
  );
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`set role ${role}`);
    await assert.rejects(
      db.query("select public.monetization_get_token_rate('fish','s2.1-pro')"),
      /permission denied/,
    );
  }
  await db.exec("reset role");
  await assert.rejects(
    db.query("update monetization.token_rates set tokens_denominator=0"),
    /check constraint/,
  );
});
