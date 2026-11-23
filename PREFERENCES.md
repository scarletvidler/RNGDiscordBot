# Lerche development preferences

Durable preferences learned from the user's discussions and feedback while working on RNGDiscordBot / Lerche. Read and maintain this file as instructed by `AGENTS.md`.

`confirmed` entries reflect explicit user preferences or clear corrections. `tentative` entries are observations to treat as soft guidance, not established requirements. These preferences apply to Lerche unless an entry states a narrower scope.

Entry format:

`- [confirmed|tentative] Preference. Scope: relevant project or area. Source: short description of the user's statement or observed evidence. Updated: YYYY-MM-DD.`

## Testing

- [confirmed] Keep tests in a dedicated repository-root `tests/` folder, rather than scattered alongside production code. Scope: Lerche test layout. Source: guidance bundle supplied by the user with the request to follow SETUP.md, which explicitly requests a dedicated tests folder. Updated: 2026-11-07.

## Security

- [confirmed] Design monetization integrations with least privilege and explicit protection against malicious inputs and unauthorized access. Scope: Lerche monetization events, database models, and future consumers. Source: user requested attacker-resistant design and the least possible privilege mindset while planning Discord monetization. Updated: 2026-11-07.

## Monetization

- [confirmed] Use the monetization table names `skus`, `sku_features`, `discord_purchases`, `discord_subscription_skus`, `discord_entitlements`, `purchase_deliveries`, and `purchase_features`. Merge subscription and one-time purchase records in `discord_purchases`, distinguished by `type`. Scope: monetization schema and documentation. Source: user approved the clearer names, chose `sku_features`, and requested implementation and migration of the unified purchase table. Updated: 2026-11-22.

- [confirmed] Show users a shared Lerche Tokens balance and translate provider/model usage into that unit for ElevenLabs, Fish, and other providers. Use 10,000 Lerche Tokens as an internal USD 1.82 generation budget and store provider/model conversions in our own database table. Scope: planned billing and customer-facing allowances; individual conversion rates and accounting details remain to be agreed. Source: user requested a shared token layer, then explicitly approved the USD 1.82 reference and a conversion table. Updated: 2026-11-12.

- [confirmed] Model monthly allowances using ElevenLabs flat API top-up rates, targeting roughly 70% of the customer price in generation value with the remainder for running costs/conversion, price customer plans in USD and display rounded, easy-to-read Lerche Token allowances. The current three-tier prices and allowances in product memory supersede earlier five-tier drafts and fixed per-feature increments. Scope: Lerche product pricing design, not authorization to launch; do not base these estimates on an assumed ElevenLabs subscription discount. Source: user requested flat top-up costs, switched to USD and requested five tiers, then raised the allowance target to roughly 70%, approved rounded allowances, and simplified to three tiers because Pro/Premium were too expensive for a Discord bot. Updated: 2026-11-12.

- [confirmed] Give Basic slightly more credits per dollar than Starter because they share features. Use paid monthly plans with token allowances rather than token-only purchasing: Starter/Basic provide standard speech without emotions or rollover; Plus includes emotions, voice selection, Higher Voice Modules, and one month of allowance rollover. Remove Pro and Premium as separate tiers. Scope: Lerche subscription packaging; current prices and allowances are in product memory; precise rollover/plan-change rules remain undecided. Source: user separated Basic/Plus emotion access, then requested better Basic value and explicitly merged all Pro/Premium features into Plus because the higher plans felt too expensive. Updated: 2026-11-12.

- [confirmed] Keep hard usage limits that protect running costs while exploring monthly charges for features such as emotion tags, reducing reliance on token resale markup. Scope: Lerche product and pricing design; current tier decisions are in product memory. Source: user requested a more stable monetization model that also earns revenue from users of cheaper or free voices. Updated: 2026-11-12.

- [confirmed] Record purchases and entitlements for all of the bot application's SKUs rather than requiring a manually maintained SKU allowlist. Recording should always run with the bot, without an enable flag. Scope: Discord monetization ingestion. Source: user stated all SKUs should reach the database when investigating a missing test donation, then explicitly requested removal of the recording flag. Updated: 2026-11-12.

- [confirmed] Monetization must reuse the normal Supabase client and credentials, storing records in its separate schema within the same database; do not require a dedicated PostgreSQL URL or login. Scope: monetization database access. Source: user explicitly requested removal of the separate connection requirement and related code. Updated: 2026-11-12.

- [confirmed] Keep monetization close to the project's existing event handlers and small exported database-model functions; avoid unnecessary service, adapter, and validation layers. Retain the shared keyedQueue and recovery at startup plus once daily. Scope: monetization structure and recovery schedule. Source: user called the implementation overly complex and requested alignment with existing project/database patterns while explicitly retaining queueing and daily recovery. Updated: 2026-11-12.

- [confirmed] Configure each SKU's purchase grant and removal actions in the database so mappings and settings can change without a deployment. Scope: purchase fulfillment. Source: user selected database configuration when planning SKU actions. Updated: 2026-11-15.

- [confirmed] Keep purchase grant and removal functions in a dedicated folder, with each function in its own file. Scope: token, feature, and plan fulfillment actions. Source: user explicitly requested separate files while authorizing monthly plans and one-month rollover. Updated: 2026-11-23.

- [confirmed] Keep token balances and delivered benefits guild-only. Subscription delivery uses the entitlement's guild; user-purchased consumable top-ups may be securely redeemed into a guild, without introducing personal balances. Token top-up removal subtracts the original grant even when remaining allowance falls below recorded usage. Scope: purchase fulfillment. Source: user selected guild balances and full reversal, then authorized the outlined monthly-plan and top-up implementation, including the required purchase-to-guild association. Updated: 2026-11-23.

- [confirmed] Keep guild feature checks in a shared featureCheck module, preload/cache on guild load and refresh after changes; expose a guildHasFeature-style check for command and future TTS behavior. Scope: guild feature access. Source: user requested a common cache/check file and gave emotion-tag stripping as a future use. Updated: 2026-11-15.

## Marketing

- [confirmed] Match Lerche's established website branding for promotional graphics, keep wording short and simple, and show each plan's included benefits directly. Scope: Lerche marketing and pricing imagery. Source: user rejected the off-brand initial pricing image and requested alignment with https://www.lerche.app plus concise, explicit benefits. Updated: 2026-11-12.

## Formatting

- [confirmed] Match new TypeScript to the project's older committed `.ts` files, favoring familiar structure and straightforward, readable control flow that the user can quickly follow. Scope: Lerche code review and implementation. Source: user requested revision of pending/staged code against their older commits rather than introducing a different style. Updated: 2026-11-22.

- [confirmed] Every file in `docs/how-to/` must have a numbered filename and be written for end users; keep internal implementation, database, and deployment instructions elsewhere. Scope: how-to documentation. Source: user explicitly requested numbered, exclusively user-facing guides and a reader-focused ban explanation. Updated: 2026-11-22.

- [confirmed] Run created or edited files through Prettier before handoff, matching the repository configuration and Cursor's Prettier settings so saving does not reformat them. Use the installed formatter rather than approximating its layout; respect supported file types and ignore rules. Scope: Lerche file changes. Source: user corrected formatting differences on save and requested alignment with their Prettier. Updated: 2026-11-07.

## Project memory

- [confirmed] Keep memory selective and concise: important decisions and reasons, major milestones, and explicit future intentions or unresolved blockers only. Do not log every message, routine action, test run, or implementation detail. Scope: Lerche topic memory and keeper updates. Source: user corrected excessive memory logging and asked for only important events and decisions. Updated: 2026-11-07.

## Guild data lifecycle

- [confirmed] Delete chat logs and TTS settings when their parent guild is explicitly deleted, using cascading foreign keys to match the uninstall command. Scope: guild database deletion; ordinary guild leave events retain records. Source: user selected cascading deletion when restoring guild relationships. Updated: 2026-11-07.

Add further preferences under concise topic headings as they are learned. Do not populate this file with assumptions just to fill sections.
