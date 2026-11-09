# Guild relationships

Migration `20261107020000_restore_guild_foreign_keys.sql` restores
`guild_chat_logs.guild_id` and `guild_tts_settings.guild_id` as foreign keys to
`guilds.id`. This supplies the relationship metadata used by Supabase's table
editor and related-table queries.

Both use `ON DELETE CASCADE`: explicitly deleting a guild also deletes its chat
logs and TTS settings, matching `/lerche-uninstall`. Ordinary Discord guild leave
events only set `left_at`, so they retain the guild and its related records.

The migration validates existing data in one transaction. If either table has
orphaned guild IDs, it fails without changing either relationship or deleting
records. Before applying through the normal migration workflow for an authorized
environment, check for missing parents:

```sql
select 'guild_chat_logs' as source, child.guild_id, count(*) as rows
from public.guild_chat_logs child
left join public.guilds parent on parent.id = child.guild_id
where parent.id is null
group by child.guild_id
union all
select 'guild_tts_settings', child.guild_id, count(*)
from public.guild_tts_settings child
left join public.guilds parent on parent.id = child.guild_id
where parent.id is null
group by child.guild_id;
```

If this returns rows, resolve those records explicitly before retrying. The
migration does not invent guild metadata or silently remove historical records.

Existing guild member and voice relationships are unchanged. Pokémon records
already link through guild membership. Monetization Discord guild IDs remain
external beneficiary identifiers; adding mandatory parent links there would
reject events for guilds absent from the local guild table.

Local verification: `npx tsx --test tests/supabase/guildForeignKeys.test.ts`.
Hosted migration application and Supabase UI verification are separate steps.
