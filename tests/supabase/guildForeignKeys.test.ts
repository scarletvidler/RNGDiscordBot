import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migration = await readFile(
  new URL(
    "../../supabase/migrations/20261107020000_restore_guild_foreign_keys.sql",
    import.meta.url,
  ),
  "utf8",
);

async function createDatabase() {
  const db = new PGlite();
  // Load the original tables, then the historical relationship removal.
  // Auth and pgcrypto are Supabase services outside this migration's scope.
  await db.exec(`
    create schema auth;
    create table auth.users(id uuid primary key, raw_user_meta_data jsonb, email text);
    create function auth.uid() returns uuid language sql as 'select null::uuid';
    create role authenticated;
  `);
  const initial = await readFile(
    new URL(
      "../../supabase/migrations/20260627173000_initial_lerche_schema.sql",
      import.meta.url,
    ),
    "utf8",
  );
  await db.exec(
    initial.replace('create extension if not exists "pgcrypto";', ""),
  );
  await db.exec(
    await readFile(
      new URL(
        "../../supabase/migrations/20260727125609_remove_cascade_from_guild_delete_from_logs_and_tts_settings.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(`
    insert into public.guilds(id, name) values ('1', 'First'), ('2', 'Second');
    insert into public.guild_chat_logs(guild_id, channel_id, raw_message)
      values ('1', '10', 'fixture'), ('2', '20', 'fixture');
    insert into public.guild_tts_settings(guild_id) values ('1'), ('2');
  `);
  return db;
}

test("guild relationships validate existing rows, reject orphans and cascade only the deleted guild", async (t) => {
  const db = await createDatabase();
  t.after(() => db.close());
  await db.exec(migration);
  const constraints = await db.query(`
    select conname, convalidated, confdeltype from pg_constraint
    where conname in ('guild_chat_logs_guild_id_fkey', 'guild_tts_settings_guild_id_fkey')
    order by conname;
  `);
  assert.deepEqual(constraints.rows, [
    {
      conname: "guild_chat_logs_guild_id_fkey",
      convalidated: true,
      confdeltype: "c",
    },
    {
      conname: "guild_tts_settings_guild_id_fkey",
      convalidated: true,
      confdeltype: "c",
    },
  ]);
  for (const table of ["guild_chat_logs", "guild_tts_settings"]) {
    assert.equal(
      (await db.query(`select * from public.${table}`)).rows.length,
      2,
    );
    await assert.rejects(
      db.exec(
        `update public.${table} set guild_id = 'missing' where guild_id = '1'`,
      ),
      { code: "23503" },
    );
  }
  await assert.rejects(
    db.exec(
      "insert into public.guild_chat_logs(guild_id, channel_id, raw_message) values ('missing', '10', 'fixture')",
    ),
    { code: "23503" },
  );
  await assert.rejects(
    db.exec(
      "insert into public.guild_tts_settings(guild_id) values ('missing')",
    ),
    { code: "23503" },
  );
  await db.exec("delete from public.guilds where id = '1'");
  for (const table of ["guild_chat_logs", "guild_tts_settings"]) {
    assert.deepEqual(
      (await db.query(`select guild_id from public.${table}`)).rows,
      [{ guild_id: "2" }],
    );
  }
});

for (const table of ["guild_chat_logs", "guild_tts_settings"]) {
  test(`existing orphan in ${table} aborts the whole migration without losing data`, async (t) => {
    const db = await createDatabase();
    t.after(() => db.close());
    await db.exec(
      `update public.${table} set guild_id = 'missing' where guild_id = '1'`,
    );
    await assert.rejects(db.exec(migration), { code: "23503" });
    await db.exec("rollback");
    assert.deepEqual(
      (
        await db.query(
          `select guild_id from public.${table} where guild_id = 'missing'`,
        )
      ).rows,
      [{ guild_id: "missing" }],
    );
    assert.equal(
      (
        await db.query(
          "select * from pg_constraint where conname in ('guild_chat_logs_guild_id_fkey', 'guild_tts_settings_guild_id_fkey')",
        )
      ).rows.length,
      0,
    );
  });
}
