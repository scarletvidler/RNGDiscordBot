# Discord monetization records

Lerche trusts subscription and entitlement events received through its Discord
client and stores their lifecycle state directly. This feature supports user and
guild beneficiaries. It stores no financial data. Configured guild purchases now
feed [fulfillment](fulfillment-actions.md), which can grant tokens or features;
personal purchase records do not create fulfillment. Purchases are not consumed
automatically. Recording always runs with the bot; there is no enable flag or SKU allowlist.

## Stored records

- `monetization.discord_purchases`: one-time purchases and subscriptions in one
  table. `type` is `one_time` or `subscription`; identity is
  `(application_id, type, id)`, so an ID collision cannot join the wrong records.
  Common columns record purchaser, title, creation/observation dates and deletion.
  Subscription rows additionally hold status, period dates, cancellation and
  entitlement IDs; one-time rows hold SKU, entitlement, guild/beneficiary, kind
  (`durable` or `consumable`) and consumption. Inapplicable columns are null.
- `monetization.discord_subscription_skus`: subscription product/title history.
- `monetization.discord_entitlements`: Discord ownership/access lifecycle and
  the canonical guild recipient used by fulfillment.
- `monetization.skus`: the automatically fetched product catalogue.
- `monetization.sku_features`: configured grant/removal actions and settings.
- `monetization.purchase_deliveries`: saved action snapshots, results and retries.
- `monetization.purchase_features`: features supplied by each purchase.

These are seven physical tables. The old subscription and one-time tables are
merged, and no compatibility tables/views with the old names remain. Existing
public RPC names and the separate subscription/one-time model read shapes stay
compatible, so this database change does not require simultaneous bot deployment.

There are no payment records, amounts, currencies, transaction IDs, or finance
import APIs. Discord IDs are text. Creation timestamps and observation timestamps
are stored separately. Product titles come from the Discord SKU catalog.

Purchaser identity and beneficiary identity are distinct: gifts and test grants
can have a beneficiary without a known purchaser. Existing `public.discord_users`
profiles are linked when available; missing profiles do not discard the purchase
or cause a fabricated username to be inserted.

## Event handling and recovery

The six handlers cover subscription and entitlement create, update, and delete.
They submit the received Discord.js object through the shared queue, including
the new object on an update when the previous cache entry is missing. Plain
functions in `supabase/models/monetization.ts` map its fields once and call the
transactional database functions. There is no per-event REST verification.

Application/SKU scoping, database constraints, per-resource serialization,
bounded queues, duplicate handling, and deletion tombstones remain. These protect
record integrity; they do not independently verify Discord's purchase decision.
The catalog is fetched for product names and application SKU metadata.

Ordering uses the bot-wide queue in `bot/helpers/keyedQueue.ts`. `startBot()`
initializes it before Discord login; monetization only submits work using
`keyedQueue.run(key, work)`. Its keys include the feature, application ID, record
type, and record ID. Other features can use the same helper with their own keys:

```ts
import { keyedQueue } from "../../helpers/keyedQueue.ts";

await keyedQueue.run(`my-feature:${recordId}`, () => updateRecord(recordId));
```

The same key runs in order; unrelated keys can progress independently. The helper
owns the global 1,000-task running/waiting limit and lets later tasks proceed after
a failure while returning errors to callers. The bot stops new submissions and
drains accepted work before disconnecting the Discord client. Stopping
monetization only stops its producers and recovery scans, not the shared queue.
This is opt-in, in-memory, and local to one bot process; it does not queue every
Discord event automatically or persist work across restarts.

`bot/modules/monetization.ts` runs recovery once at startup and every 24 hours
thereafter. It uses Discord.js SKU, entitlement, and subscription fetch methods,
with pagination and no custom REST adapter. Overlapping scans share the running
scan, and shutdown clears the timer and stops recovery from submitting new work.
Live events and recovery both use the same queued model writes. Observation
timestamps are captured before queueing events or fetching recovery pages so a
slow scan cannot overwrite a more recent live update.
Subscription discovery uses all application subscription SKUs and known users. This cannot recover
subscriptions with neither a known user nor a discoverable entitlement. Missing
rows or failed scans are not treated as deletion; explicit delete events preserve
tombstones. Logs contain sanitized operation summaries, not event payloads.

## Reading records

Use the typed server-side models in `supabase/models/monetization.ts`:

```ts
import {
  getSubscriptions,
  getOneTimePurchases,
} from "../supabase/models/monetization.ts";

const subscriptions = await getSubscriptions({
  applicationId,
  userId,
});
const purchases = await getOneTimePurchases({
  applicationId,
  guildId,
});
```

Use the final row's `id` as `after` for the next page. Subscription results include
SKU/title items; `is_current` distinguishes historical items. User filters select
purchasers; guild filters select beneficiaries. These models do not authorize a
Discord command caller: future commands must enforce caller permissions.

## Database access

Monetization uses the existing server-side Supabase client from
`supabase/client.ts` and the same `SUPABASE_URL` and `SUPABASE_SECRET_KEY`
as the rest of the bot. Records remain in the `monetization` schema of that
same database. No separate PostgreSQL connection, login, or application binding
is required.

Service-role-only RPC functions in `public` call the existing transactional
functions in the private schema. Anonymous and authenticated clients cannot call
these RPCs or access the underlying records. The schema does not need to be added
to Supabase's exposed schemas. The shared server credential can access all
applications' records; Discord application/SKU validation remains in the bot.

Apply `20261112000000_shared_supabase_monetization.sql` through the normal
migration workflow before deploying this code. It preserves purchase history,
adds the RPC entry points, and removes the old dedicated-login access setup.
Never expose the shared secret key to a browser.

## Configuration and validation

Use the bot's existing `SUPABASE_URL` and `SUPABASE_SECRET_KEY`. Recovery has a
fixed 24-hour interval; no monetization-specific environment settings are needed.

All durable, consumable, and subscription SKUs belonging to the logged-in application
are discovered automatically, including scheduled tier changes. New event SKUs
refresh the catalog on demand. Discord's non-purchasable subscription groups
(type 6) are not purchase records.
The normal Supabase settings are required; missing configuration is reported
as an error. Legacy enable, SKU-list, dedicated database URL, and
`DISCORD_MONETIZATION_RECONCILE_MINUTES` variables are unused and can be removed. Separate test and production environments.

Run `npm run test:bot` and `npm run typecheck:bot`. Database tests use isolated
PGlite instances, not hosted Supabase. Before running in a development environment,
validate the migration, shared Supabase connection, and actual Discord lifecycle events.
Confirm duplicates do not multiply records, updates use the received payload,
deletions preserve history, and configured guild benefits grant/remove exactly
once. Unconfigured and personal purchases should remain recorded without grants;
automatic Discord consumption is not implemented.

See [the original recording design diagrams](diagrams/implemented-monetization.html)
for the earlier architecture; table names there predate the unified purchase table.

The [SKU configuration and fulfillment state](sku-fulfillment.md) records saved
action settings and progress. Guild fulfillment is created atomically with
recording, dispatched through the same entitlement queue, and revisited by the
startup/daily scan even if Discord recovery fails.
