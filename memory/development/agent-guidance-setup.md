# Agent guidance
- ID: agent-guidance-setup
- Domain: development
- Status: reference
- Updated: 2026-11-07

## Decisions

- Repository guidance lives in [AGENTS.md](../../AGENTS.md); lasting user preferences, including the dedicated test-folder convention, live in [PREFERENCES.md](../../PREFERENCES.md).
- The [memory keeper](../../.codex/agents/memory-keeper.toml) owns `MEMORY.md` and `memory/`; the primary agent maintains preferences. Keep one memory writer at a time and preserve concurrent edits.
- Memory preserves consequential decisions, milestones, future intentions, and blockers. It does not authorize implementation, scheduling, commits, or external actions.
