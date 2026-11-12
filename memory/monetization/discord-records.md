# Discord monetization records

- ID: discord-monetization-records
- Domain: monetization
- Status: in-progress
- Updated: 2026-11-12

## Decisions

- User-confirmed scope: records for both user and guild purchases. Premium benefits, token grants, and consumable fulfillment are outside this feature.
- User correction on 2026-11-07: store no financial data. Remove payments, amounts, currencies, and the finance-import path; this supersedes the earlier financial-record design and future-source proposal.
- Trust lifecycle payloads received through the Discord client as authoritative subscription/one-time purchase records. Persist them directly rather than independently re-verifying each event through REST; retain list-based recovery for missed events.
- Preserve product identity/history and user or guild beneficiary links. Keep purchaser and beneficiary identities distinct when Discord does not identify a purchaser.
- On 2026-11-12, the user replaced the dedicated database login/application binding approach with shared Supabase access. The current access and ingestion requirements are in [monetization preferences](../../PREFERENCES.md#monetization); retain record-integrity safeguards and the [security preference](../../PREFERENCES.md#security).
- User-confirmed on 2026-11-09: queue ownership belongs to the bot process, initialized by `startBot` and drained during bot shutdown. Monetization only submits namespaced work to the shared helper; other features opt in rather than routing every event through it. See [event handling and recovery](../../docs/discord-monetization-records.md#event-handling-and-recovery).

## Current state

- Production LercheBot (`njxtsserdzxwkemjnauf`) has the private lifecycle-only schema and guild cascade relationships applied on 2026-11-09, with no financial storage. On 2026-11-12, the user-authorized [shared Supabase migration](../../supabase/migrations/20261112000000_shared_supabase_monetization.sql) was applied; its five public RPCs were verified callable by `service_role` and denied to `anon`/`authenticated`. The corresponding bot code has not been deployed. See [Discord monetization records](../../docs/discord-monetization-records.md) for architecture and setup.

## Open decisions and future intentions

- Deploy the corresponding bot code and validate shared Supabase access and live Discord recording/recovery under current environment authorization; recovery of the reported production donation remains unverified. Dedicated login/application binding provisioning is superseded. These notes do not authorize deployment or live actions.
