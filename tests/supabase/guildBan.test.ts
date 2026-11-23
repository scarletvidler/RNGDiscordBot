import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("guild ban defaults existing and new guilds to false and rejects null", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(
    "create table public.guilds(id text primary key); insert into public.guilds values ('existing');",
  );
  await db.exec(
    await readFile(
      new URL(
        "../../supabase/migrations/20261112020000_add_guild_ban.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec("insert into public.guilds(id) values ('new');");
  assert.deepEqual(
    (await db.query("select is_banned from public.guilds")).rows,
    [{ is_banned: false }, { is_banned: false }],
  );
  await db.exec(
    "update public.guilds set is_banned = true where id = 'existing'",
  );
  assert.deepEqual(
    (
      await db.query(
        "select is_banned from public.guilds where id = 'existing'",
      )
    ).rows,
    [{ is_banned: true }],
  );
  await assert.rejects(db.exec("update public.guilds set is_banned = null"), {
    code: "23502",
  });
});
