# SKU configuration and fulfillment state

SKU rules and purchase delivery state live in the `monetization` schema of the
normal Supabase database. This guide covers configuration and saved decisions;
[fulfillment actions](fulfillment-actions.md) covers delivery, monthly allowances,
rollover, and token usage.

Apply the checked-in migrations before deploying their corresponding bot code.
The plan and token-rate additions are `20261123000000_plan_allowances.sql` and
`20261123010000_token_rates.sql`. Follow the
[migration deployment workflow](../supabase/README.md#migration-deployment).
Migrations do not invent Discord SKUs or enable the Starter/Basic/Plus products.

## 1. Configure a known SKU

`monetization.sku_features` has one row per application/SKU already in `skus`.
You can edit it in Supabase's Table Editor. New rows default to disabled; select
`once` for one-time delivery or `while_active` for ongoing access.

Set `grant_action`, `grant_settings`, `remove_action`, and `remove_settings` to
the action names and JSON settings you intend to support. Names are stored as
configuration, never evaluated as SQL, JavaScript, or module paths. Dispatch
selects only the known token, feature, and plan handlers and `none`; unknown names fail.
The handlers validate their own settings in the database.

`effective_from` is compared with the entitlement's original creation time,
not the time a recovery scan found it. Leaving the default current timestamp
prevents older purchases from being prepared automatically by recovery.
An earlier cutoff should be a deliberate backfill decision.

A database trigger manages `version`, `created_at`, and `updated_at`. Meaningful
configuration changes increment the version, including edits through the Table
Editor. Sending the same settings again does not create a new version.

The matching TypeScript model is a plain function:

```ts
import { upsertSkuAction } from "../supabase/models/skuFulfillment.ts";

await upsertSkuAction({
  application_id: applicationId,
  sku_id: skuId,
  enabled: false,
  mode: "once",
  grant_action: "none",
  grant_settings: {},
  remove_action: "none",
  remove_settings: {},
  effective_from: new Date().toISOString(),
});
```

`upsertSkuAction` replaces the complete editable configuration. It is not a
partial patch; pass all fields. `getSkuAction(applicationId, skuId)` returns the
saved row or `null` if none exists.

For the agreed Starter/Basic/Plus templates, use
[`supabase/configurePlans.ts`](../supabase/configurePlans.ts). It requires actual
Discord SKU IDs and an explicit launch cutoff, validates the imported catalog,
and previews disabled rules by default. `--apply` saves them, `--enable` enables
delivery, and `--replace` is required to change an existing rule. Select the
environment file explicitly; see the [setup examples](../supabase/README.md#configure-plan-skus).

The templates configure monthly quantities of 15,000, 35,000, and 70,000. Plus
adds `emotion_tags`, `voice_selection`, and `higher_voice_modules`, with
`rollover_months: 1`; Starter and Basic use `rollover_months: 0`.
Top-ups use a caller-selected quantity and `redeem_to_guild: true`.
Names and prices in the Discord store are not used to identify a configuration.

## 2. Prepare a guild purchase

Recording now prepares eligible guild fulfillment in the same transaction.
The explicit helper remains available for already-recorded purchases:

```ts
import { createPurchaseFulfillment } from "../supabase/models/skuFulfillment.ts";

const fulfillment = await createPurchaseFulfillment(
  applicationId,
  entitlementId,
);
```

This helper reads the saved entitlement and SKU configuration in the database.
It creates a row only for an eligible entitlement with enabled configuration.
Unconfigured/disabled SKUs, pre-cutoff purchases, deleted/ended entitlements,
not-yet-started entitlements, and already-consumed purchases with no prior
fulfillment do not receive a new row. An ineligible purchase returns `null`.
The original purchase remains recorded. A missing entitlement raises an error;
the purchase must be saved before it can be prepared.

A new fulfillment starts with:

- `desired_state = granted`: what is intended.
- `applied_state = ungranted`: nothing has been delivered.
- `processing_status = pending`: the entitlement's guild is the destination.
- A database-generated `operation_id`, preserved across repeated creation calls.
- A copy of the action names, settings, mode, and the selected configuration version.

Guild subscriptions use the saved entitlement's `guild_id`. User-only purchases
remain recorded but do not receive a personal token balance or automatic guild
destination. Configured consumable top-ups can be redeemed into a guild using
`/tokens-redeem`; a separate, immutable redemption record binds that purchase to
its destination after buyer and server-permission checks. The Discord entitlement
itself is not rewritten to pretend Discord supplied a guild ID.

The ordinary preparation helper cannot choose a different recipient. Preparation
itself executes nothing; the queued dispatcher delivers the pending action after
recording or redemption commits.

## 3. Repeated calls retain the original decision

The primary key is `(application_id, entitlement_id)`. Calling preparation again
returns the existing row without replacing its action snapshot, operation ID,
recipient, or processing state. It does not upgrade it to the latest SKU version.

For example, a purchase prepared with a quantity of 10,000 retains that setting
if the SKU is later edited to 20,000. Disabling the SKU also does not erase its
existing fulfillment. The saved removal action remains available for future use.

The database protects the purchase identity, configuration snapshot, and chosen
recipient from replacement. Recovery fills an old unresolved recipient from the
canonical entitlement guild or an explicitly saved top-up redemption. Historical
personal/mismatched fulfillment is preserved but excluded from automatic dispatch.

Monthly plan renewal is separate from repeating this preparation call. The same
plan delivery retains its configuration snapshot, while each confirmed billing
period receives its own uniquely identified token grant. Editing a rule therefore
does not silently rewrite benefits already promised to an existing entitlement.

## 4. Inspect saved state

```ts
import { getPurchaseFulfillment } from "../supabase/models/skuFulfillment.ts";

const fulfillment = await getPurchaseFulfillment(applicationId, entitlementId);
```

It returns the saved row or `null`. The table also has fields for the eventual
grant result, attempt count, sanitized error, retry time, and grant/removal dates.
The explicit action functions now update completion state, results,
dates, and committed attempt counts atomically with their effects. Dispatch also
records failed attempts and a bounded retry delay. Do not mark a grant successful manually
as a substitute for actually delivering it.

## Access and verification

The four model functions reuse `getSupabaseAdmin()` and call explicit public RPCs,
matching the existing monetization models. Only `service_role` can execute those
RPCs. Anonymous/authenticated users cannot call them or access the new tables.
The private schema does not need to be exposed through the Data API.

Local PGlite tests cover access restrictions, identity constraints, configuration
versioning, eligibility, duplicate preparation, and immutable snapshots. Model
tests use a mocked shared Supabase client. No live Discord or hosted database is
needed for these tests.
