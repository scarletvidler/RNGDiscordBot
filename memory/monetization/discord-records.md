# Discord monetization records
- ID: discord-monetization-records
- Domain: monetization
- Status: done
- Updated: 2026-11-07

## Purpose and user intent

On 2026-11-07 the user requested a plan for a new feature branch from `main`, Discord monetization events, and Supabase models for subscriptions, one-time purchases, and payments. Each payment should link to either a subscription or a one-time purchase. Records should retain SKU, product/payment title, dates, amounts, and the purchasing Discord user. The user requested a Diagram Design visual and a walkthrough before implementation. Security preferences are recorded in [PREFERENCES.md](../../PREFERENCES.md#security).

## Current understanding

Repository evidence supplied by the primary agent on 2026-11-07:

- Checkout is on `master`; `origin/HEAD` points to `origin/master`; no local or tracked remote `main` was listed. Unrelated uncommitted changes exist and must be preserved.
- Existing `codex/discord-monetization` branch contains six event handlers, token grants, premium commands, and migration `20261018120000_discord_monetization.sql`. This is reference material, not an agreed branch base or approved grant behavior for this request.
- Installed Discord.js is 14.26.4. Its typings expose entitlement and subscription create/update/delete events. Update callbacks receive nullable old state followed by new state.
- `bot/bot.server.ts` discovers `*.event.ts` files and appends the client argument. Its synchronous try/catch does not await event promises; new adapters must handle asynchronous failures.
- `supabase/models/users.ts` uses the existing admin client. `public.discord_users` requires a username as well as its text Discord ID; purchases may arrive before a user has been recorded.
- `supabase/client.ts` uses `SUPABASE_SECRET_KEY`. Historical migration `20260627173709_remote_schema.sql` grants default function privileges to `anon` and `authenticated`, requiring explicit revocation for new sensitive functions.
- The user subsequently said “build it,” authorizing implementation. Work lives in the separate checkout `C:/Users/Scarl/Documents/Code/Personal/RNGDiscordBot-monetization-records` on `codex/feat-discord-monetization-records`, based on `master` commit `524bba19a6f3fa01bbb0163f0da9dfdba3a1ed3c` (equal to tracked `origin/master`). The original checkout's dirty work was preserved. No `main` existed, so the repository default was used.

### Local implementation and verification

Primary-agent implementation and independent-review evidence reported on 2026-11-07:

- Six lifecycle adapters feed opt-in monetization processing, canonical Discord REST validation, bounded retries, and per-resource serialization. Startup and periodic reconciliation use bounded pagination and known-user/known-subscription scans. Benefits, token grants, payment inference, and consumption remain unchanged.
- Migration `supabase/migrations/20261107000000_discord_monetization_records.sql` creates a private `monetization` schema containing subscriptions, one-time purchases, payments, SKU/item/entitlement records, and login-to-application bindings.
- Direct PostgreSQL access uses restricted writer, reader, and finance NOLOGIN roles granted to separately provisioned logins. SECURITY DEFINER functions have static search paths and bind application scope to `session_user`. There is no admin Supabase fallback; remote connections require verified TLS.
- Financial records enforce exactly one parent, use bigint amounts represented as strings in TypeScript, permit nullable verified data with one-way enrichment, and preserve immutable identity/items. Latest-summary updates have date guards; history is retained and deletion tombstones dominate stale snapshots.
- Unknown Discord profiles use optional foreign-key linkage, automatically attached when the existing `discord_users` row appears. No fabricated username/user record is inserted.
- `supabase/models/monetization.ts` provides typed direct-private-schema model access. Public generated `supabase/types.ts` is unchanged. Setup and operation are documented in the feature checkout's `docs/discord-monetization-records.md`.
- Added `pg`, `@types/pg`, and development PGlite SQL testing. New tests live under `tests/bot/modules/monetization/` and `tests/supabase/`; discovery retains legacy tests and typechecking includes Supabase/test sources.
- Review fixes covered SQL NULL constraint bypass, JSON-null bounds, old/equal deletion events, parent locking, TLS overrides, guild-only entitlement linkage, and history/payment items. The final actual-session-user privilege assertion rejects superuser/RLS-bypass access, finance-role membership, and direct table/schema privileges on the runtime writer path.
- Independent review found that a rejected initial login-check promise could remain cached forever. The parent fixed per-pool coalescing to reset on rejection and added `tests/supabase/monetizationConnection.test.ts` regression coverage for transient-failure recovery and unauthorized retries. Review otherwise reported no blockers.
- Final frozen implementation: the parent reported `npm run test:bot` passing 46/46 with no skips, `npm run typecheck:bot` passing, and `git diff --check` passing. This supersedes the earlier 42-test checkpoint. Local implementation is complete; deployment/live validation are separate, unperformed steps.
- Docker daemon was unavailable. SQL behavior was exercised using embedded PostgreSQL fixtures, not the full hosted Supabase stack or multiprocess concurrency. No bot start, live Discord calls, remote migrations, commits, pushes, or deployment occurred.
- The feature remains disabled until migration, restricted login provisioning, application binding, and environment configuration are completed in an authorized environment. No financial source is connected. Ambiguous subscription 404s retain records and mark scans incomplete rather than inventing deletion. Existing broad credentials elsewhere in the bot remain a process-level risk.

## Research and alternatives

Official documentation reviewed by the primary agent on 2026-11-07 establishes that subscription objects may contain multiple SKUs, and that entitlements represent access. Subscription status alone must not grant benefits. The documented bot subscription, entitlement, and SKU schemas do not expose actual charged amounts or payment transaction IDs. Therefore a complete financial ledger cannot be inferred from lifecycle events alone; the payment-data source remains unresolved.

Initial design proposals from the planning phase (retained as rationale; the implementation summary above supersedes tentative details):

- Start a fresh `codex/feat-discord-monetization-records` branch from the verified default branch in an isolated checkout when implementation is authorized. Preserve the existing monetization branch and unrelated edits; resolve the user's `main` reference before choosing the final base.
- Keep the three requested business entities: `subscriptions`, `one_time_purchases`, and `payments`. Add separate entitlement storage and a SKU catalog; use subscription-item relationships for multiple SKUs rather than silently selecting the first.
- Give payments real foreign keys and an exactly-one-parent constraint. Use payment SKU items if multiple SKUs must be represented. Preserve title snapshots, provider identity, integer minor-unit amounts, currency, and separate source timestamps from local observation timestamps. Unknown financial values remain NULL; lifecycle events do not create invented successful payment records.
- Link verified Discord purchasers to existing users, distinguish purchaser from entitlement beneficiary/guild, and handle missing users without dropping incoming records. Soft-delete or mark revoked state instead of cascading away financial history.
- Handle all six lifecycle events through thin adapters and shared validation/persistence. Use application/SKU checks, idempotency, out-of-order safeguards, bounded retries, startup/periodic reconciliation, and explicit failure reporting. Incomplete or failed pagination must never imply deletion.
- Restrict the new database path to scoped credentials and narrowly granted operations/RPCs; revoke `PUBLIC`, `anon`, and `authenticated` access to sensitive operations. RLS alone does not restrict a Supabase secret key because it uses `service_role` with RLS bypass. The existing bot process still holding a broad credential remains a limitation even if the new path is scoped.
- Keep this branch focused on records and model APIs. Premium commands, token grants, access-policy changes, and consuming consumable purchases are not proposed for this initial storage scope. Consumables must only be marked consumed after actual fulfillment.

This adds reconciliation and permission-testing work, but avoids conflating access, subscription lifecycle, and money. The older branch's grant behavior should not be copied as proof of payment.

## Decisions

- 2026-11-07: User requested planning and a visual explanation. The overall implementation approach, support tables, and branch name remain recommendations, not approved implementation decisions.
- 2026-11-07: User confirmed support for both user and guild purchases, with records only in this scope. Premium benefits and fulfillment remain outside this branch's agreed scope.
- 2026-11-07: User accepted nullable amounts and a future verified financial-import path. Lifecycle events must not be treated as payment transactions. The actual future financial source remains to be selected.
- 2026-11-07: User selected the default light Diagram Design style for this visual.
- 2026-11-07: User subsequently instructed “build it,” authorizing local implementation of the agreed records-only scope. The earlier pending-implementation state is superseded. The primary agent resolved the requested branch base to the repository default `master` because `main` did not exist; this does not authorize deployment or production changes.

## Open questions

- What future verified source can provide actual payment IDs, charged amounts, currencies, refunds, and historical transactions? Nullable amounts and deferred verified import are accepted for the present scope.
- Which development environment will be authorized for login provisioning, migration application, and live Discord validation?

## TODOs and next step

- MON-01 (requested, done): Plan and diagram produced at `C:/Users/Scarl/.codex/visualizations/2026/11/07/01a1b77e-6773-7d30-8e2c-7e6030b7d0a8/discord-monetization.html`. Basic PowerShell checks passed SVG XML parsing, accessible role, viewBox, and absence of scripts. Full Diagram Design self-check could not run because no working Python was available and the uv bootstrap failed with a missing target directory. Browser preview was blocked by file-URL security policy; no visual render was verified.
- MON-02 (done): Created isolated feature checkout from verified default `master`; original dirty work preserved.
- MON-03 (done locally): Implemented schema, restricted grants, typed models, six event adapters, and reconciliation. Financial import remains future work; no remote migration applied.
- MON-04 (done locally): Added mocked handler/model tests and embedded PostgreSQL tests in dedicated `tests/` locations, including security/constraints and replay/stale-state cases.
- MON-05 (done locally): Final frozen suite passes 46/46 with no skips, typecheck passes, and `git diff --check` passes after independent review and privilege/retry regression fixes.
- MON-06 (pending environment authorization): Provision restricted login and application binding, apply migration, configure and validate in a development environment. Full hosted-stack and live Discord validation remain unperformed. One-time purchase tests use application test mode rather than subscription test entitlements.

## Evidence and related topics

Planning inspection supplied by the primary agent: `git status --short`, `git branch -a`, `git diff --stat master...codex/discord-monetization`, branch file reads, `package.json`, installed `node_modules/discord.js/package.json` and typings, `bot/bot.server.ts`, `supabase/client.ts`, `supabase/models/users.ts`, and schema migrations.

Artifact existence and basic validation outcomes above were reported by the primary agent on 2026-11-07. The initial planning phase ran no runtime tests; subsequent local implementation checks are listed separately above. All implementation evidence was supplied by the parent and its independent reviewer; the keeper did not rerun tests or modify the implementation checkout.

Official sources, accessed 2026-11-07; recheck before implementation:

- [Discord subscriptions](https://docs.discord.com/developers/resources/subscription): multi-SKU records, status, periods, and access caveat.
- [Discord entitlements](https://docs.discord.com/developers/resources/entitlement): access state and optional user/guild ownership.
- [Discord SKUs](https://docs.discord.com/developers/resources/sku): names, types, and ownership flags.
- [Discord Gateway events](https://docs.discord.com/developers/events/gateway-events): six lifecycle events; entitlement updates are not recurring payment notifications.
- [Implementing one-time purchases](https://docs.discord.com/developers/monetization/implementing-one-time-purchases): fulfillment/consumption order and test mode.
- [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security): grants, policies, and secret-key bypass.
- [Supabase Postgres roles](https://supabase.com/docs/guides/database/postgres/roles): scoped service roles and grants.
