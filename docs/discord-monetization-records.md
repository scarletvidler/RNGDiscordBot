# Discord monetization records

This integration records Discord subscription and entitlement lifecycle events in
Supabase Postgres. It supports user and guild beneficiaries. It does not change
premium access, guild token limits, commands, or TTS behavior, and it never consumes
one-time purchases. It is disabled unless explicitly enabled.

## What is recorded

- `monetization.subscriptions`: recurring purchase state, purchaser ID, product
  title, period dates, cancellation, and deletion markers.
- `monetization.one_time_purchases`: durable or consumable purchase records linked
  to their Discord entitlement, with product identity and beneficiary details.
- `monetization.payments`: verified financial transactions, each with exactly one
  subscription or one-time purchase parent. A source/payment ID identifies a
  transaction for idempotent imports.
- Supporting SKU, subscription-item, entitlement, and payment-item records retain
  product identity and access facts separately from financial facts.

Discord IDs are text. Monetary amounts are integer minor units represented as
strings in TypeScript to preserve precision. Currency and amount remain null when
unknown. Source timestamps are distinct from observation timestamps: the creation
time derived from a Discord snowflake is not a payment timestamp. Product-title
snapshots preserve historical names.

Discord's documented bot APIs do not expose actual charged amounts or transaction
IDs. The six event handlers therefore never create payments. A future trusted
financial source can use `createFinancialImporter` with a separately authorized
database connection; passing an object to this helper is not proof of payment.
The importer must verify its source before calling the model. No financial source
or scheduled importer is connected by this feature.
Newer verified data may fill previously unknown amount/currency or payment time;
once known, those values cannot be rewritten by a retry. Refund state can advance
without rewriting the original charged amount or granting/revoking access.

Purchaser identity is separate from the beneficiary. Subscription events identify
the purchaser; an entitlement beneficiary is not automatically assumed to be the
payer, particularly for gifts and test grants. A missing existing
`public.discord_users` profile must not discard a purchase: retain the Discord ID
and leave the optional profile link unresolved until it can be matched. No fake
username is inserted.

Server-side consumers use the typed model factory in
`supabase/models/monetization.ts`:

```ts
const records = createMonetizationStore();
const subscriptions = await records.listSubscriptions({ applicationId, userId });
const purchases = await records.listOneTimePurchases({ applicationId, guildId });
const payments = await records.listPayments({ applicationId, userId, limit: 100 });
```

Use the final row's `id` as `after` for the next page. Subscription and payment
results include SKU items and title snapshots. Subscription items retain historical
SKUs and identify current items with `is_current`, so later financial imports can
still reference an older tier. User filters select verified purchasers, not every
beneficiary. These server-side models do not authorize a Discord command caller;
future commands must enforce their own user/guild permissions before reading.
`createMonetizationStore` is the bot's writer connection and verifies that role.
A separate read-only service should inject its reader connection into
`createMonetizationModels`; the database denies write functions to that reader role.

## Event and reconciliation flow

The existing loader registers `subscriptionCreate`, `subscriptionUpdate`,
`subscriptionDelete`, `entitlementCreate`, `entitlementUpdate`, and
`entitlementDelete`. Update handlers use the new object even if the old cache entry
is absent. The handlers catch asynchronous errors and log sanitized summaries.

Create/update events trigger canonical Discord REST reads, with application and
SKU validation, rather than persisting potentially stale event snapshots. Delete
events retain tombstones. Processing is serialized per resource, and database
writes reject older observations and resurrection of deleted IDs. No event grants
access or infers a charge from a subscription renewal.

An initial background scan and periodic scans repair missed events. Entitlement
queries include ended/deleted records. Subscription scans use the configured SKUs
and known users, because Discord's bot subscription listing requires a user ID.
There is no complete historical financial backfill: subscriptions with neither a
known user nor a discoverable entitlement may require a later targeted recovery.
Pagination and pending work are bounded; overlapping scans are coalesced. A failed
request, incomplete scan, or absent row never constitutes a deletion.
Known subscriptions are also fetched individually. A generic 404 is not reliable
proof of subscription deletion: if the delete event was missed and Discord no
longer returns the subscription, the last record is retained and reconciliation
reports a failure for investigation. It is not silently marked deleted.

## Least-privilege database access

The private `monetization` schema is not exposed through the Supabase Data API.
The integration uses `pg` with a separate connection string; it never falls back to
`SUPABASE_SECRET_KEY`. Security-definer functions have a fixed search path, accept
typed/validated data, and are explicitly granted to purpose-specific roles.
Ordinary client roles have no access. Runtime roles must not own tables or inherit
administrative privileges.

Apply the new migration through the normal reviewed Supabase migration workflow
for the chosen environment:
`supabase/migrations/20261107000000_discord_monetization_records.sql`.
Provision a dedicated database login using your secret management process and
grant only `monetization_writer` to that login. Bind that login to its Discord
application through `monetization.login_applications`; functions check the actual
session login, so a role grant alone is insufficient. Provision
`monetization_finance` access separately and do not put that credential in the bot.
`monetization_reader` is available for trusted server-side read models.
Never put passwords into migrations, documentation, shell history, or commits.

Example administrative setup, after creating a password-protected, non-superuser
login named `lerche_monetization` through your secret provisioning process:

```sql
grant monetization_writer to lerche_monetization;
insert into monetization.login_applications (login_role, application_id)
values ('lerche_monetization', 'YOUR_DISCORD_APPLICATION_ID');
```

Replace the application placeholder with a real numeric Discord ID. This setup is
an environment action; automated tests and application startup do not perform it.

Remote database connections require verified TLS. Use the provider's correct
hostname and trusted certificate chain. Plaintext is only permitted for a loopback
development database. Do not disable certificate verification to resolve a
deployment error.

The rest of Lerche still uses its existing broad Supabase credential. A separate
restricted connection limits this component's privileges, but does not isolate it
from a full compromise of the same bot process. Stronger isolation would require
moving ingestion to a separate service without the broad credential.

## Configuration

Set these only after the migration and restricted login are ready:

```dotenv
DISCORD_MONETIZATION_ENABLED=true
DISCORD_MONETIZATION_SKU_IDS=123456789012345678,234567890123456789
DISCORD_MONETIZATION_RECONCILE_MINUTES=60
# Inject a restricted Postgres connection URL through your secret manager:
# DISCORD_MONETIZATION_DATABASE_URL
```

SKU IDs must belong to the logged-in Discord application and represent a durable,
consumable, or subscription SKU, not a subscription group. Configure every SKU
needed by active subscriptions and scheduled tier changes. The application ID is
taken from the logged-in client. Test and production apps need separate approved
SKU lists and databases. The reconciliation interval accepts 5–1440 minutes.
Removing or disabling configuration does not erase stored history.

## Verification

```sh
npm run test:bot
npm run typecheck:bot
```

All bot and database tests live under `tests/` and remain in discovery.
Database tests use an isolated in-memory PGlite PostgreSQL instance, applying the
new migration against minimal fixtures. They do not read environment credentials
or contact Supabase. These tests exercise SQL behavior, not hosted Supabase login,
TLS, pooler behavior, or multi-process concurrency on a deployed server.

Before enabling in a development environment, verify the restricted login and
migration on that environment, then test Discord lifecycle events. Use application
test mode for one-time purchases; subscription test entitlements are not the
one-time-purchase test procedure. Confirm duplicate deliveries create no duplicate
records, canceled subscriptions preserve their entitlement state, revocation is
retained, and no payments or benefits appear from test events.

## References

- [Discord subscriptions](https://docs.discord.com/developers/resources/subscription)
- [Discord entitlements](https://docs.discord.com/developers/resources/entitlement)
- [Discord Gateway events](https://docs.discord.com/developers/events/gateway-events)
- [Discord one-time purchases](https://docs.discord.com/developers/monetization/implementing-one-time-purchases)
- [Supabase database roles](https://supabase.com/docs/guides/database/postgres/roles)
- [Supabase RLS and secret-key bypass](https://supabase.com/docs/guides/database/postgres/row-level-security)

Reviewed against the installed Discord.js API and official documentation on
2026-11-07. Neither subscription status nor a payment row is an access-control
decision; future benefit logic must use validated entitlements.
