import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("leave message migration defaults existing and new guilds to enabled and persists opt-outs", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create table public.guild_tts_settings (guild_id text primary key);
      insert into public.guild_tts_settings (guild_id) values ('existing');
    `);
    await db.exec(
      await readFile(
        new URL(
          "../../supabase/migrations/20261122000000_leave_message_setting.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await db.exec(
      "insert into public.guild_tts_settings (guild_id) values ('new')",
    );
    assert.deepEqual(
      (
        await db.query(
          "select guild_id, leave_message_enabled from public.guild_tts_settings order by guild_id",
        )
      ).rows,
      [
        { guild_id: "existing", leave_message_enabled: true },
        { guild_id: "new", leave_message_enabled: true },
      ],
    );
    await db.exec(
      "update public.guild_tts_settings set leave_message_enabled = false where guild_id = 'existing'",
    );
    assert.deepEqual(
      (
        await db.query(
          "select guild_id, leave_message_enabled from public.guild_tts_settings order by guild_id",
        )
      ).rows,
      [
        { guild_id: "existing", leave_message_enabled: false },
        { guild_id: "new", leave_message_enabled: true },
      ],
    );
    await assert.rejects(
      db.exec(
        "update public.guild_tts_settings set leave_message_enabled = null where guild_id = 'new'",
      ),
      /not-null|null value/i,
    );
  } finally {
    await db.close();
  }
});
