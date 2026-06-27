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
SUPABASE_ANON_KEY=your-local-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-local-service-role-key
```

`SUPABASE_SERVICE_ROLE_KEY` is used by the Discord bot for server-side writes. Do not expose it to a browser.

## Structure

- `migrations/` contains database schema changes.
- `seeds/` contains local seed data loaded by `supabase db reset`.
- `models/` contains TypeScript helpers for table-specific reads and writes.
- `client.ts` creates Supabase clients for bot and auth usage.
- `auth.ts` contains email/password sign-up, login, logout, and current-user helpers.
