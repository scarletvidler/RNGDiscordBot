# Discord monetization records

Lerche trusts subscription and entitlement events received through its Discord
client and stores their lifecycle state directly. This feature supports user and
guild beneficiaries. It stores no financial data and does not grant premium
benefits, change TTS limits, or consume purchases. Recording always runs with the bot; there is no enable flag or SKU allowlist.

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
drains accepted work before closing the database and Discord client. Stopping
monetization only stops its producers and recovery scans, not the shared queue.
This is opt-in, in-memory, and local to one bot process; it does not queue every
Discord event automatically or persist work across restarts.

Startup and periodic reconciliation repair missed events using Discord list APIs.
Subscription discovery uses all application subscription SKUs and known users. This cannot recover
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

After the migrations are applied, use the bot's existing Supabase settings:

```dotenv
DISCORD_MONETIZATION_RECONCILE_MINUTES=60
# SUPABASE_URL and SUPABASE_SECRET_KEY are shared with the rest of the bot.
```

All durable, consumable, and subscription SKUs belonging to the logged-in application
are discovered automatically, including scheduled tier changes. New event SKUs
refresh the catalog on demand. Discord's non-purchasable subscription groups
(type 6) are not purchase records. The interval accepts 5–1440 minutes.
The normal Supabase settings are required; missing configuration is reported
as an error. Legacy enable, SKU-list, and dedicated database URL variables are
unused and can be removed. Separate test and production environments.

Run `npm run test:bot` and `npm run typecheck:bot`. Database tests use isolated
PGlite instances, not hosted Supabase. Before running in a development environment,
validate the migration, shared Supabase connection, and actual Discord lifecycle events.
Confirm duplicates do not multiply records, updates use the received payload,
deletions preserve history, and no benefits or consumption are triggered.

See [the implementation diagrams](diagrams/implemented-monetization.html).
