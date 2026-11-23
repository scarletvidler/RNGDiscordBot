# Discord monetization records

- ID: discord-monetization-records
- Domain: monetization
- Status: in-progress
- Updated: 2026-11-23

## Decisions

- User-confirmed scope: record both user and guild purchases while keeping benefits guild-only. Guild subscriptions and user-purchased consumable redemption are covered by [SKU fulfillment](sku-fulfillment.md).
- User correction on 2026-11-07: store no financial data. Remove payments, amounts, currencies, and the finance-import path; this supersedes the earlier financial-record design and future-source proposal.
- Trust lifecycle payloads received through the Discord client as authoritative subscription/one-time purchase records; retain list-based recovery for missed events. Preserve product history and beneficiary links without conflating purchaser and beneficiary when Discord does not identify a purchaser.
- On 2026-11-12, the user replaced the dedicated database login/application binding approach with shared Supabase access. The current access and ingestion requirements are in [monetization preferences](../../PREFERENCES.md#monetization); retain record-integrity safeguards and the [security preference](../../PREFERENCES.md#security).
- User-confirmed on 2026-11-09: queue ownership belongs to the bot process, initialized by `startBot` and drained during bot shutdown. Monetization only submits namespaced work to the shared helper; other features opt in rather than routing every event through it. See [event handling and recovery](../../docs/discord-monetization-records.md#event-handling-and-recovery).
- On 2026-11-12, the user approved applying the simplification. Retain transactional SQL beneath plain model functions: independent table upserts would lose atomic multi-table consistency and stale-update/deletion safeguards.
- Multi-statement migrations requiring atomicity must declare explicit transactions with the pinned CLI; whole-file PGlite execution can hide a missing boundary. Follow [migration deployment guidance](../../supabase/README.md#migration-deployment).

## Current state

- Production LercheBot (`njxtsserdzxwkemjnauf`) has the consolidated purchase schema and, as verified on 2026-11-23, the previously missing guild-ban migration plus plan-allowance and token-rate migrations. The production migration dry run is up to date; new tables are private with RLS and RPC privileges remain service-only. The guild-ban rollout blocker is resolved. See [record schema](../../docs/discord-monetization-records.md#stored-records) and [fulfillment state](../../docs/fulfillment-actions.md#stored-configuration-and-results).

## Open decisions and future intentions

- Database rollout does not deploy the bot. Bot deployment and live Discord recording/recovery validation remain outstanding; product activation and fulfillment validation are tracked in [SKU fulfillment](sku-fulfillment.md#open-decisions-and-future-intentions).
