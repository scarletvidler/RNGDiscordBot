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

- [confirmed] Record purchases and entitlements for all of the bot application's SKUs rather than requiring a manually maintained SKU allowlist. Recording should always run with the bot, without an enable flag. Scope: Discord monetization ingestion. Source: user stated all SKUs should reach the database when investigating a missing test donation, then explicitly requested removal of the recording flag. Updated: 2026-11-12.

- [confirmed] Monetization must reuse the normal Supabase client and credentials, storing records in its separate schema within the same database; do not require a dedicated PostgreSQL URL or login. Scope: monetization database access. Source: user explicitly requested removal of the separate connection requirement and related code. Updated: 2026-11-12.

## Formatting

- [confirmed] Run created or edited files through Prettier before handoff, matching the repository configuration and Cursor's Prettier settings so saving does not reformat them. Use the installed formatter rather than approximating its layout; respect supported file types and ignore rules. Scope: Lerche file changes. Source: user corrected formatting differences on save and requested alignment with their Prettier. Updated: 2026-11-07.

## Project memory

- [confirmed] Keep memory selective and concise: important decisions and reasons, major milestones, and explicit future intentions or unresolved blockers only. Do not log every message, routine action, test run, or implementation detail. Scope: Lerche topic memory and keeper updates. Source: user corrected excessive memory logging and asked for only important events and decisions. Updated: 2026-11-07.

## Guild data lifecycle

- [confirmed] Delete chat logs and TTS settings when their parent guild is explicitly deleted, using cascading foreign keys to match the uninstall command. Scope: guild database deletion; ordinary guild leave events retain records. Source: user selected cascading deletion when restoring guild relationships. Updated: 2026-11-07.

Add further preferences under concise topic headings as they are learned. Do not populate this file with assumptions just to fill sections.
