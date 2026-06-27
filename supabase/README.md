# Supabase

This folder contains Lerche's local Supabase project.

## Local setup

```sh
npx supabase start
npx supabase db reset
```

Add these values to `.env` or `.env.development` after `supabase start` prints them:

```env
SUPABASE_URL=http://127.0.0.1:55241
SUPABASE_SECRET_KEY=your-local-secret-key
```

`SUPABASE_SECRET_KEY` is used by the Discord bot for server-side reads and writes. Do not expose it to a browser.

## Structure

- `migrations/` contains database schema changes.
- `seeds/` contains local seed data loaded by `supabase db reset`.
- `models/` contains TypeScript helpers for table-specific reads and writes.
- `client.ts` creates the server-side Supabase client used by the bot.
