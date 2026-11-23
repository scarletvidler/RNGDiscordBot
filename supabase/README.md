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
local stack. Deployment therefore explicitly runs
`supabase db push --yes --remote --include-all` after linking the intended project.
`--include-all` includes reviewed local migrations missing from remote history even
when newer migrations were already applied. It does not replay migrations that are
already recorded. To preview pending migrations, add `--dry-run --skip-vault`.
Local development should use the same pinned version as CI.

Apply and verify migrations **before restarting the bot with the corresponding
code**. The database workflow does not coordinate a separate host's automatic bot
deployment. In particular, `20261112020000_add_guild_ban.sql` must exist before the
command/message access checks run, and the plan/usage and token-rate migrations
must exist before the new purchase and TTS code runs. Review the dry run against
the intended project; a local project link is not proof of the production target.

CLI 3.1.0 does not add an implicit transaction around migration statements.
Migrations that require atomic multi-statement changes or `LOCK TABLE` must
include explicit `BEGIN;` and `COMMIT;` boundaries. PGlite executing a whole SQL
file in one call can otherwise hide this difference from the hosted CLI runner.

See the [Supabase CLI v3 migration guide](https://supabase.com/docs/guides/local-development/cli/migrating-to-v3).

## Configure plan SKUs

Create the actual Discord guild-subscription SKUs first and let Lerche's catalog
recovery import them into `monetization.skus`. The setup script does not create
Discord products or guess IDs. It validates the selected application's imported
SKUs, subscription scope, and consumable top-up types before writing any rules.

Choose the environment file explicitly, then preview the rules:

```sh
node --env-file=.env.beta --import tsx supabase/configurePlans.ts --app APPLICATION_ID --effective-from 2026-12-01T00:00:00Z --starter STARTER_SKU_ID --basic BASIC_SKU_ID --plus PLUS_SKU_ID
```

Replace the uppercase placeholders with real IDs and use the intended launch
timestamp. Omit plans that are not ready. The default is a read-only preview with
`enabled: false`. Add `--apply` to save those disabled rules. Add `--enable` only
when ready to deliver purchases. Updating an existing rule, including enabling a
previously disabled rule, also requires `--replace`. Keep the original intended
`--effective-from` date when updating; moving it backwards can include older
purchases. Never match a SKU by its display name alone.

For a consumable top-up, use `--topup TOPUP_SKU_ID --quantity 10000` instead of the
plan arguments. Choose the quantity for that specific product. Its configuration
explicitly enables guild redemption and uses a nonexpiring token grant.

The script previews previous and proposed settings and validates all selections
before its first write. Each SKU is saved independently; if a later write fails,
review the saved rows before retrying. Prices remain in Discord. Purchase history,
delivery results, and granted features are populated by the bot, not this script.

See [SKU configuration](../docs/sku-fulfillment.md) and
[fulfillment actions](../docs/fulfillment-actions.md) for billing-period and
rollover behavior.

## Structure

- `migrations/` contains database schema changes.
- `seeds/` contains local seed data loaded by `supabase db reset`.
- `models/` contains TypeScript helpers for table-specific reads and writes.
- `client.ts` creates the server-side Supabase client used by the bot.
