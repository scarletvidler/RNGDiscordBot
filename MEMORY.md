# Lerche topic memory and backlog

Read this index at the start of work, then load only relevant topic files. Maintained by `memory-keeper`; the current user request determines what to work on.

Preferences belong in [PREFERENCES.md](PREFERENCES.md). Detailed discussions belong in `memory/<domain>/<topic>.md`. Create domain folders as needed; avoid pre-creating empty categories.

## Topics

| Topic ID | Domain | Topic file | Status | Next question or action | Updated |
| --- | --- | --- | --- | --- | --- |
| agent-guidance-setup | development | [Agent guidance setup](memory/development/agent-guidance-setup.md) | done | Use keeper for meaningful future discussions; native role loading remains unverified | 2026-11-07 |
| discord-monetization-records | monetization | [Discord monetization records](memory/monetization/discord-records.md) | done | Local implementation verified: 46 tests, typecheck, diff check; environment setup/live validation await authorization | 2026-11-07 |
| guild-list-pagination | discord | [Guild list pagination](memory/discord/guild-list-pagination.md) | done | Local checks passed; live Discord pagination not exercised | 2026-11-08 |

Pub/sub was supplied as an example of the memory workflow, not as an approved project task.

## Status meanings

- `reference`: useful knowledge or discussion without an implementation request.
- `idea`: a possible future improvement or stated intention, not approved work.
- `researching`: investigation is underway.
- `planned`: an approach has been agreed; execution still depends on the current request.
- `in-progress`: implementation is actually underway.
- `blocked`, `deferred`, or `dropped`: retain the reason in the topic file.
- `done`: completion is supported by evidence recorded in the topic file.

Keep one row per topic, including links to completed or dropped topics so their reasoning remains discoverable. Split lengthy topics into linked files only when needed. An index row is a summary; the topic file holds the detailed TODOs and evidence.
