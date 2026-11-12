# Supabase

This folder contains Lerche's local Supabase project.

## Local setup

```sh
npx supabase@3.1.0 start
npx supabase@3.1.0 db reset
```

Add these values to `.env` or `.env.development` after `supabase start` prints them:

```env
SUPABASE_URL=http://127.0.0.1:55241
SUPABASE_SECRET_KEY=your-local-secret-key
```

`SUPABASE_SECRET_KEY` is used by the Discord bot for server-side reads and writes. Do not expose it to a browser.

## Migration deployment

GitHub Actions deploys pending migrations on pushes (including merges) to
`master` for production and `staging` for staging. Both workflows also support
manual dispatch. They use the corresponding project/password secrets and
`SUPABASE_ACCESS_TOKEN`.

All three Supabase workflows pin CLI `3.1.0`; update them together after testing.
CLI v3 uses `[local_smtp]` in `config.toml` and defaults database commands to the
local stack. Deployment therefore explicitly runs `supabase db push --yes --remote`
after linking the intended project. To preview pending migrations, add `--dry-run`.
Local development should use the same pinned version as CI.

See the [Supabase CLI v3 migration guide](https://supabase.com/docs/guides/local-development/cli/migrating-to-v3).

## Structure

- `migrations/` contains database schema changes.
- `seeds/` contains local seed data loaded by `supabase db reset`.
- `models/` contains TypeScript helpers for table-specific reads and writes.
- `client.ts` creates the server-side Supabase client used by the bot.
