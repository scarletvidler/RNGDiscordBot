# Discord monetization records

- ID: discord-monetization-records
- Domain: monetization
- Status: done
- Updated: 2026-11-09

## Decisions

- User-confirmed scope: records for both user and guild purchases. Premium benefits, token grants, and consumable fulfillment are outside this feature.
- User correction on 2026-11-07: store no financial data. Remove payments, amounts, currencies, and the finance-import path; this supersedes the earlier financial-record design and future-source proposal.
- Trust lifecycle payloads received through the Discord client as authoritative subscription/one-time purchase records. Persist them directly rather than independently re-verifying each event through REST; retain list-based recovery for missed events.
- Preserve product identity/history and user or guild beneficiary links. Keep purchaser and beneficiary identities distinct when Discord does not identify a purchaser.
- Keep restricted, application-bound database access and record-integrity safeguards. Existing broad credentials elsewhere in the bot remain a process-level limitation. See the [security preference](../../PREFERENCES.md#security).
- User-confirmed on 2026-11-09: queue ownership belongs to the bot process, initialized by `startBot` and drained during bot shutdown. Monetization only submits namespaced work to the shared helper; other features opt in rather than routing every event through it. See [event handling and recovery](../../docs/discord-monetization-records.md#event-handling-and-recovery).

## Current state

- Lifecycle-only storage using Discord event payloads directly is implemented locally. Financial storage and import APIs are removed; rollout remains pending. See [Discord monetization records](../../docs/discord-monetization-records.md) for architecture, configuration, and migration instructions.

## Open decisions and future intentions

- Choose and authorize a development environment for rollout and live validation; a code push did not authorize these actions.
- The integration remains disabled pending authorized migrations, restricted-login provisioning, and configuration; hosted-stack and live Discord validation remain outstanding.
