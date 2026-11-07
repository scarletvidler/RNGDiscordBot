# Lerche development preferences

Durable preferences learned from the user's discussions and feedback while working on RNGDiscordBot / Lerche. Read and maintain this file as instructed by `AGENTS.md`.

`confirmed` entries reflect explicit user preferences or clear corrections. `tentative` entries are observations to treat as soft guidance, not established requirements. These preferences apply to Lerche unless an entry states a narrower scope.

Entry format:

`- [confirmed|tentative] Preference. Scope: relevant project or area. Source: short description of the user's statement or observed evidence. Updated: YYYY-MM-DD.`

## Testing

- [confirmed] Keep tests in a dedicated repository-root `tests/` folder, rather than scattered alongside production code. Scope: Lerche test layout. Source: guidance bundle supplied by the user with the request to follow SETUP.md, which explicitly requests a dedicated tests folder. Updated: 2026-11-07.

## Security

- [confirmed] Design monetization integrations with least privilege and explicit protection against malicious inputs and unauthorized access. Scope: Lerche monetization events, database models, and future consumers. Source: user requested attacker-resistant design and the least possible privilege mindset while planning Discord monetization. Updated: 2026-11-07.

Add further preferences under concise topic headings as they are learned. Do not populate this file with assumptions just to fill sections.
