# Agent guidance setup

- ID: agent-guidance-setup
- Domain: development
- Status: done
- Updated: 2026-11-07

## Purpose and user intent

On 2026-11-07, the user supplied `Lerche-agent-guidance.zip` and requested “follow setup.md”. Its setup instructions request integrating repository guidance, preferences, topic memory, and a memory-keeper subagent; keeping tests in a dedicated folder; and recording future ideas without implementing them merely because they are recorded.

## Current understanding

- The main agent found no existing guidance or memory files to merge. Installed [AGENTS.md](../../AGENTS.md), [PREFERENCES.md](../../PREFERENCES.md), [MEMORY.md](../../MEMORY.md), and [.codex/agents/memory-keeper.toml](../../.codex/agents/memory-keeper.toml). `SETUP.md` remained a handoff note and was not installed.
- Existing test files for top.gg statistics, guild runtime state, and voting were moved to `tests/bot/modules/`, with the latter two under `tts/`. Imports were adjusted. [package.json](../../package.json) now discovers `tests/**/*.test.ts`; [tsconfig.json](../../tsconfig.json) includes `tests/**/*.ts` alongside bot sources. No production code was changed.
- The dedicated-test-folder preference and its source are maintained in [PREFERENCES.md](../../PREFERENCES.md).
- The current collaboration API does not expose custom-role selection. This note was saved by a general subagent following the installed keeper instructions, demonstrating the documented fallback. Native custom-role loading has not been verified.
- No model, global configuration, or permission changes were made. Topic memory is maintained on demand, not by a continuously running service.

## Decisions

- 2026-11-07: Follow the supplied setup instructions to integrate guidance and establish persistent topic memory. Preserve future intentions as context; recorded TODOs do not authorize implementation. Pub/sub was only a workflow example and is not a backlog item.

## TODOs and next step

- SETUP-1 — Done, requested: install the guidance and keeper configuration, relocate existing tests, and verify test discovery and typechecking.
- Use the keeper after meaningful future project discussion or work. If native custom-role selection is unavailable, use the general-subagent fallback specified in `AGENTS.md`; do not claim native role activation based solely on this setup.

## Evidence and related topics

- User request and supplied ZIP, 2026-11-07; implementation and verification results supplied by the main agent.
- `npm run test:bot`: all 10 tests passed after relocation.
- `npm run typecheck:bot`: completed without errors.
- `git diff --check`: passed.
- The main agent inspected configuration fields against [official subagent documentation](https://learn.chatgpt.com/docs/agent-configuration/subagents), accessed 2026-11-07. Optional Python TOML parsing could not run because Python was unavailable; parser validation is not claimed.
