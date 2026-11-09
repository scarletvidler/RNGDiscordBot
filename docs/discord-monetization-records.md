# Discord monetization records

Lerche trusts subscription and entitlement events received through its Discord
client and stores their lifecycle state directly. This feature supports user and
guild beneficiaries. It stores no financial data and does not grant premium
benefits, change TTS limits, or consume purchases. It is disabled by default.

## Stored records

- `monetization.subscriptions`: Discord subscription ID, purchaser ID, title,
  status, period dates, cancellation, and deletion state.
- `monetization.one_time_purchases`: durable or consumable purchases, their SKU
  and title, entitlement, purchaser when known, beneficiary/user or guild, dates,
  and consumed/deleted state.
- `entitlements`, `skus`, and `subscription_items` retain beneficiary state,
  catalog metadata, and subscription product/title history.

There are no payment records, amounts, currencies, transaction IDs, or finance
import APIs. Discord IDs are text. Creation timestamps and observation timestamps
are stored separately. Product titles come from the Discord SKU catalog.

Purchaser identity and beneficiary identity are distinct: gifts and test grants
can have a beneficiary without a known purchaser. Existing `public.discord_users`
profiles are linked when available; missing profiles do not discard the purchase
or cause a fabricated username to be inserted.

## Event handling and recovery

The six handlers cover subscription and entitlement create, update, and delete.
They map the Discord.js payload into a stored snapshot directly, including the
new object on an update when the previous cache entry is missing. There is no
per-event REST fetch to prove that a subscription or purchase is valid.

Application/SKU scoping, basic shape validation, per-resource serialization,
bounded queues, duplicate handling, and deletion tombstones remain. These protect
record integrity; they do not independently verify Discord's purchase decision.
The catalog is fetched for product names and configured SKU metadata.

Startup and periodic reconciliation repair missed events using Discord list APIs.
Subscription discovery uses configured SKUs and known users. This cannot recover
subscriptions with neither a known user nor a discoverable entitlement. Missing
rows or failed scans are not treated as deletion; explicit delete events preserve
tombstones. Logs contain sanitized operation summaries, not event payloads.

## Reading records

Use the typed server-side models in `supabase/models/monetization.ts`:

```ts
const records = createMonetizationStore();
const subscriptions = await records.listSubscriptions({
  applicationId,
  userId,
});
const purchases = await records.listOneTimePurchases({
  applicationId,
  guildId,
});
```

Use the final row's `id` as `after` for the next page. Subscription results include
SKU/title items; `is_current` distinguishes historical items. User filters select
purchasers; guild filters select beneficiaries. These models do not authorize a
Discord command caller: future commands must enforce caller permissions.

## Least-privilege access

The private `monetization` schema is outside the Supabase Data API. The integration
uses a dedicated `pg` connection with no fallback to `SUPABASE_SECRET_KEY`.
Database functions use a fixed search path, parameterized inputs, and application
bindings checked against the actual session login. Ordinary client roles cannot
access the schema. RLS and restricted writer/reader roles remain.

Apply the repository migrations in order using the normal reviewed workflow for
the chosen environment. The follow-up simplification migration removes the old
financial tables, columns, and functions. Review that removal before applying it
to any database that has already received financial records. No migration is
applied automatically by this code change.

Provision a non-administrative login, grant `monetization_writer`, and bind it to
its Discord application in `monetization.login_applications`. Inject its connection
URL through secret management; never put passwords in migrations or commits.
Read-only server consumers can inject a `monetization_reader` connection into
`createMonetizationModels`. Runtime roles must not own tables or inherit admin
privileges. Remote connections require verified TLS; loopback development
connections may be plaintext.

Other Lerche code still uses a broad Supabase credential in the same process.
This dedicated connection limits the integration's privileges, but does not
isolate it from a full compromise of that process.

## Configuration and validation

After the migrations and restricted login are ready:

```dotenv
DISCORD_MONETIZATION_ENABLED=true
DISCORD_MONETIZATION_SKU_IDS=123456789012345678,234567890123456789
DISCORD_MONETIZATION_RECONCILE_MINUTES=60
# Inject DISCORD_MONETIZATION_DATABASE_URL through secret management.
```

Use the logged-in application's durable, consumable, and subscription SKUs,
including scheduled tier changes. The interval accepts 5–1440 minutes. Disabling
the integration does not erase records. Separate test and production environments.

Run `npm run test:bot` and `npm run typecheck:bot`. Database tests use isolated
PGlite instances, not hosted Supabase. Before enabling a development environment,
validate the migration, restricted login, TLS, and actual Discord lifecycle events.
Confirm duplicates do not multiply records, updates use the received payload,
deletions preserve history, and no benefits or consumption are triggered.

See [the implementation diagrams](diagrams/implemented-monetization.html).
