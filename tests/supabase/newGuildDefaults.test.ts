import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { DEFAULTS } from "../../bot/config/defaults.ts";

test("new guild defaults change without altering existing guilds", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`
    create table public.guilds(id text primary key, token_limit integer default 5000);
    create table public.guild_tts_settings(guild_id text primary key, tts_model text default 'eleven_v3');
    insert into public.guilds(id) values ('old');
    insert into public.guild_tts_settings(guild_id) values ('old');
  `);
  await db.exec(
    await readFile(
      new URL(
        "../../supabase/migrations/20261123020000_new_guild_defaults.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(
    `insert into public.guilds(id) values ('new'); insert into public.guild_tts_settings(guild_id) values ('new');`,
  );
  assert.deepEqual(
    (
      await db.query(
        "select token_limit, tts_model from public.guilds join public.guild_tts_settings on id = guild_id order by id",
      )
    ).rows,
    [
      { token_limit: 1000, tts_model: "eleven_flash_v2_5" },
      { token_limit: 5000, tts_model: "eleven_v3" },
    ],
  );
  assert.equal(DEFAULTS.defaultModel, "eleven_flash_v2_5");
});
