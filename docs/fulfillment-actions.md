# Fulfillment actions

Each grant/removal model has its own file under
`supabase/models/fulfillmentActions/`: `grantTokens.ts`, `removeTokens.ts`,
`grantFeatures.ts`, `removeFeatures.ts`, `grantPlan.ts`, and `removePlan.ts`.
They use the normal Supabase client and explicit service-only RPCs. Calls take
an application ID and entitlement ID; saved purchase state supplies the recipient
and settings. Database strings are never evaluated as code or module paths.

Use the [SKU configuration guide](sku-fulfillment.md) to prepare actual products.
Apply all pending migrations through the
[deployment workflow](../supabase/README.md#migration-deployment) before starting
the new bot code. Database migration success does not publish Discord products,
enable their rules, or prove live voice playback works.

## Stored configuration and results

| Table                       | Purpose                                                                       |
| --------------------------- | ----------------------------------------------------------------------------- |
| `skus`                      | Imported Discord catalog and application identity.                            |
| `sku_features`              | Editable grant/removal rules for each real SKU.                               |
| `discord_purchases`         | Recorded one-time purchases and subscriptions, distinguished by `type`.       |
| `discord_subscription_skus` | Subscription-to-SKU relationships.                                            |
| `discord_entitlements`      | Discord's purchase/access lifecycle and canonical guild or user.              |
| `purchase_deliveries`       | Saved rule snapshot, chosen destination, delivery state, and retry details.   |
| `purchase_features`         | Feature access supplied by each purchase.                                     |
| `guild_token_grants`        | Token quantities, remaining amounts, expiry, and billing-period identity.     |
| `guild_plan_state`          | Plan enrollment and the existing allowance/access retained during transition. |
| `topup_redemptions`         | A user-purchased consumable's immutable guild destination.                    |
| `token_usage`               | Idempotent generation reservations and settled usage.                         |
| `token_rates`               | Provider/model unit conversion and reservation estimates.                     |

Only SKU configuration is entered manually. Purchase records, deliveries,
feature grants, monthly grants, and consumption results come from bot processing.
The private schema is not exposed through the Supabase Data API; public RPCs
provide the required operations to `service_role` only.

## Monthly plans and one-month rollover

Configure a monthly guild subscription with `mode: "while_active"`,
`grant_action: "grant_plan"`, and `remove_action: "remove_plan"`. For Plus:

```json
{
  "quantity": 70000,
  "features": ["emotion_tags", "voice_selection", "higher_voice_modules"],
  "rollover_months": 1
}
```

Use that object as `grant_settings` and `{}` as `remove_settings`. Starter and
Basic use quantities of 15,000 and 35,000, an empty feature array, and
`rollover_months: 0`. The combined plan handler applies tokens and feature access
in one transaction; calling two separate completion handlers for one delivery
would not provide that guarantee.

The handler reads the saved subscription's actual `current_period_start` and
`current_period_end`. Each entitlement/period is granted once, even if Discord
repeats an event or recovery retries it. Subscription updates and recovery can
process a new period even though the original entitlement was already delivered.
An entitlement without a known valid billing period cannot invent a monthly refill.

Starter/Basic unused monthly tokens expire at that period's end. Plus unused
tokens expire one calendar month after their source period ends. Renewing does
not keep moving old tokens' expiry: tokens can roll over only once. Usage spends
the earliest-expiring tokens first. For example, tokens granted for January
1-February 1 can remain usable until March 1 on Plus; they cannot roll into March.

Runtime balance reads and spending enforce expiry as well as the daily recovery
pass. A stopped bot or delayed timer cannot make expired credit spendable.

Ordinary cancellation keeps access until the entitlement ends. Ending access
removes plan features and unused plan credit without touching independent top-ups.
Refund/deletion reverses the grant for the saved subscription's current billing
period, if that period was delivered, including tokens already spent. Earlier
periods lose only their unused tokens; historical spending is not clawed back.
If Discord has advanced the billing period before its new grant was delivered,
there is no new grant to reverse. Unused older tokens still expire on removal,
and earlier spending stays recorded. This distinction avoids treating every past
billing month as refunded when Discord does not identify historical refunded cycles.
A resulting shortfall is not erased. Upgrade and downgrade processing uses the
ended/new entitlements and confirmed billing periods.

The new allowance is the advertised monthly plan total, including the ordinary
free allowance. First enrollment preserves the unspent legacy free allowance for
restoration when paid access ends; separate top-ups and custom legacy credit are
retained. Existing stored usage is never reset to manufacture a new balance.

## Token top-ups

Configure a consumable SKU with `mode: "once"`, `grant_action: "grant_tokens"`,
`remove_action: "remove_tokens"`, and `remove_settings: {}`:

```json
{ "quantity": 10000, "redeem_to_guild": true }
```

Quantity must be a positive whole JSON number within PostgreSQL's integer range.
The explicit `redeem_to_guild` setting opts this product into guild redemption.
Other user-only purchases remain recorded without automatic fulfillment.

The buyer runs `/tokens-redeem` in the target server. The command checks the buyer
and required server permission, and the database checks the recorded buyer,
application, configured consumable SKU, and purchase eligibility. Redemption binds
the purchase to one guild; retries cannot move it to another guild or grant it
twice. Balances remain guild-only.

After tokens are durably delivered, the bot consumes the Discord entitlement so
the buyer can purchase that SKU again. A failed Discord consumption request is
retried separately; it must not repeat the token grant. Consuming an entitlement
does not remove its delivered tokens. Top-up tokens have no expiry.

Removal subtracts the original saved token quantity even if tokens were spent.
It never reads a new quantity from an edited SKU rule. Repeated removals do not
deduct again, and removing an undelivered purchase deducts nothing. Available
balance is clamped at zero while historical usage and any shortfall remain.

## Feature grants and enforcement

Feature-only products can still use `grant_features` / `remove_features`, with
settings such as `{ "features": ["emotion_tags", "voice_selection"] }`.
Removal revokes only access supplied by that purchase; another active purchase
granting the same feature keeps it available.

`featureCheck.ts` caches access for up to 60 seconds, scoped by application and
guild, and refreshes after local changes. Read failures do not reuse expired
permissions. Old in-flight reads cannot restore invalidated access.

Paid-plan checks are applied at playback as well as in relevant configuration
commands. Without `emotion_tags`, supported emotion/delivery tags are stripped.
Without `voice_selection`, stored custom voices are retained but are not used.
Without `higher_voice_modules`, playback uses the standard model, ElevenLabs
Flash v2.5. ElevenLabs v3 and Fish Pro require that feature. Existing servers
retain their prior feature access until joining a managed plan; new servers use
standard feature access. Ending a managed plan does not restore unrestricted
legacy feature access.

## Shared Lerche Tokens and safe spending

`token_rates` stores `provider`, `model`, `unit`, `tokens_numerator`,
`tokens_denominator`, and `estimate_units_per_character`. Conversion settings are
cached for up to 60 seconds. Editing a conversion does not require changing SKU
quantities. The internal reference is 10,000 Lerche Tokens for USD 1.82 of
generation budget. Monetary payments are not recorded here.

ElevenLabs billed `character-cost` credits convert 1:1 into Lerche Tokens. Fish
`s2.1-pro` converts UTF-8 bytes at 15/182 Lerche Tokens per byte. Usage rounds up to
whole tokens. If an ElevenLabs response lacks a valid usage header, successful
generation is charged using the saved text estimate; it is never silently free.
Reservation estimates can be adjusted for provider voice/dictionary multipliers.

Before generation, the bot reserves estimated tokens using the Discord message
ID. Only a newly created reservation may start a provider request. It then settles
actual usage before playback or releases the reservation on a known provider
failure. Repeated settlement cannot charge the same message twice. Reservations
and spending use database locks, so cached guild totals cannot overwrite a
concurrent purchase or another message. An interrupted reservation whose provider
outcome is unknown is eventually settled at the estimate rather than made free.
If the provider reports a higher actual cost, that cost remains recorded even if
it leaves a shortfall; subsequent requests cannot spend an unavailable balance.

## Queueing, recovery, and failures

Entitlement recording and pending preparation commit together. The existing
keyed queue then runs the saved action for that purchase. Startup and once-daily
recovery retry unfinished deliveries, process confirmed subscription periods,
and retry Discord consumption. Local durable recovery still runs if Discord's
API is unavailable. No per-purchase timer is required.

SQL errors roll back effects and completion together. The dispatcher records a
safe failure code and bounded retry delay; raw provider/SQL errors are not stored
as delivery errors. One failure does not block unrelated purchases. Completed
delivery is not marked failed merely because a subsequent cache refresh failed.

Local tests use PGlite and mocked providers/Discord. Before enabling real rules,
test purchase, renewal, rollover expiry, refund, top-up redemption, repeated
consumption, and voice playback in the intended development guild.
