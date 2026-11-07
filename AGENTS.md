# RNGDiscordBot / Lerche — coding guidance

Help develop and maintain Lerche, the Discord text-to-speech bot in this repository. Own the result from understanding the request through implementation and verification. You may edit code directly; use subagents when they add useful expertise or independent review.

## Learn the user's preferences

- Read the repository-root `PREFERENCES.md` at the start of work and apply relevant entries when planning, coding, testing, and reviewing. If it is missing, create a small file when there is a durable preference to record and file changes are allowed.
- Maintain that file as the user discusses Lerche and responds to your work. Record explicit, lasting preferences and clear corrections as `confirmed`. Record inferred preferences as `tentative`; do not turn a one-off request into a permanent rule.
- Each entry should state the preference, its scope, a short source summary, and the date. Keep entries specific and useful; record only preferences that should affect future work.
- Repeated observations can strengthen a tentative entry, but only the user's confirmation promotes it to `confirmed`. Do not treat your own generated code or recommendations as evidence of what the user prefers.
- The user's current instructions take precedence over older preferences. Update an entry when the user clearly changes their lasting preference; a task-specific exception does not change the general rule. If a conflict materially affects the work and remains ambiguous, ask a focused question.
- Update matching entries instead of appending duplicates. Preserve unrelated entries and user edits. Keep task progress and architecture facts in the appropriate project documentation, and never store secrets, private message content, or unrelated personal details here.
- Make preference updates alongside authorised work, without a separate approval question for every clear statement. Discussion-only requests permit these requested notes, but not implementation. An explicit no-file-change request overrides this: hold proposed updates in the conversation until writing is allowed. Preference recording does not itself authorise commits, pushes, or broader permissions.
- At the end of the task, briefly state any preferences added or changed so the user can correct them. Do not claim an entry was saved unless you actually updated the file.

## Remember discussions and future work

- Read `MEMORY.md` at the start of a session, then open only the topic files relevant to the request. Use their context to avoid repeating settled discussions. Check older claims against current code or documentation before relying on them.
- Delegate persistent topic notes to the `memory-keeper` subagent defined in `.codex/agents/memory-keeper.toml`. It maintains the index in `MEMORY.md` and topic files under `memory/<domain>/<topic>.md`, such as `memory/scaling/pub-sub.md`.
- Capture meaningful Lerche discussions, not just implementation tasks: future ideas, requirements, research, alternatives, decisions and reasons, unresolved questions, rejected approaches, and useful lessons. Summarise rather than saving entire transcripts.
- When the user says they want something later, record it as a future intention with its context. Hypothetical examples are not backlog requests. Recording an idea, an agreed design, or a TODO does not authorise implementation or schedule work.
- After a useful discussion, a decision, or a completed coding task, give the keeper the absolute repository path, relevant topic IDs, user statements, research sources, and verified outcomes. Batch related updates; do not spawn it for every message. Save important decisions before moving to another topic or ending the turn.
- Use one memory writer at a time in this session. Await its result and inspect the changes before reporting them. The keeper must reread files before patching so existing notes and other sessions' updates are preserved.
- The keeper owns `MEMORY.md` and `memory/` only. You maintain `PREFERENCES.md` using the preference rules above; cross-link rather than duplicating preferences in topic notes. Implementation agents return progress evidence for the keeper instead of separately rewriting the memory files.
- If the named agent is unavailable, delegate a general subagent with the same instructions from its TOML file. If delegation or writing is unavailable, report the unsaved update; never pretend it will persist. An explicit no-file-change request also applies to the keeper.
- Briefly tell the user what was remembered and where. Do not start unrelated backlog items unless requested.

## Understand before building

- For a new feature or unclear request, discuss the intended outcome, who uses it, and what successful behavior looks like. Ask a few focused questions at a time and reuse answers already given.
- Suggest useful alternatives, explain your recommendation, and separate essentials from optional ideas. Discuss complexity, running cost, maintenance, and growth where they affect the decision.
- For substantial features or architectural changes, agree the scope, approach, and acceptance criteria before implementing. Summarise decisions in the conversation and have the memory keeper preserve relevant context for later sessions.
- Clear, bounded fixes can proceed without a lengthy planning or approval cycle. Do not restart product discovery for every change or seek approval again for work already authorised.

## Read the existing project first

- Check the working tree and preserve unrelated or uncommitted work. Read relevant local instructions, callers, relevant tests, and configuration before editing.
- Use the current code and package scripts as evidence; documentation may be outdated. Check official documentation when uncertain about Discord, Discord.js, Supabase, or a provider API, using the project's installed versions.
- Useful starting points:
  - `README.md` and `docs/how-to/`: product behavior and user guidance.
  - `server.js` and `bot/bot.server.ts`: startup and dynamic loading.
  - `bot/commands/`, `bot/events/`, `bot/modules/`, `bot/helpers/`: bot behavior.
  - `supabase/models/`, `supabase/migrations/`, `supabase/types.ts`: data access, schema changes, and types.
  - `pulumi/` and Docker files: infrastructure and runtime configuration.
- Match the current TypeScript strict-mode, ESM, and relative-import conventions. Reuse existing helpers and patterns before introducing new abstractions or dependencies.

## Implement focused changes

- Make the smallest complete change that satisfies the agreed behavior. Avoid unrelated refactors, broad formatting changes, and speculative features.
- Preserve command names, settings, and stored data unless changing them is part of the request. Explain compatibility or migration implications.
- For bugs, establish the failure and root cause before fixing it. Add a regression test when practical; never weaken tests to obtain a passing result.
- Use subagents for substantial independent research, testing, or review when available. Give each a specific goal, relevant context, file ownership, and expected verification. Review their actual work before accepting it; avoid overlapping edits and unnecessary delegation for small tasks.

## Protect Lerche's behavior

Apply the checks relevant to the change:

- Keep guild settings, user permissions, token balances, caches, and playback state correctly scoped. Check the existing access rules before processing messages or commands.
- For TTS changes, consider queue ordering, concurrent messages, stop/disconnect behavior, cleanup, and provider failures. Avoid duplicate generation or usage charging during retries.
- For API and database changes, consider timeouts, rate limits, bounded retries, and useful error handling. Keep sensitive message content and credentials out of logs.
- Use the existing migration workflow for schema changes; keep data helpers and types consistent. Do not silently rewrite migration history or reset a database.
- Preserve the existing command/event loading contracts. Do not assume importing the bot entry point is free of startup or network side effects.

## Verify and review

- Follow the test-location preference in `PREFERENCES.md`. Within the dedicated `tests/` folder, mirror the source structure where useful: for example, `bot/modules/tts/voteGate.ts` has its test at `tests/bot/modules/tts/voteGate.test.ts`. Keep test-only fixtures and helpers there too.
- Existing scattered tests are a legacy layout, not a convention to copy. When adding or relocating tests, update imports, test discovery, and relevant configuration so the tests in `tests/` actually run. Keep unrelated bulk migration separate unless requested; do not discard useful coverage just to change its location.
- Recheck `package.json` for current commands. The `test:bot` script discovers `tests/**/*.test.ts`; verify the expected tests are executed when changing the layout.
- Run focused checks first, then relevant broader checks. `npm run typecheck:bot` covers `bot/**/*.ts` and `tests/**/*.ts` through `tsconfig.json`. Do not assume the bot check independently verifies infrastructure or every other directory.
- Use the existing test framework. Write or delegate meaningful tests rather than asking the user to hand-write them. Prefer mocked external services for automated tests.
- Inspect the final diff for correctness, permissions, regressions, and unnecessary complexity. Use an independent review for substantial changes when available, especially around authentication, concurrency, billing/token accounting, or data migrations.
- Passing local tests does not prove live Discord voice playback works. State which behavior was tested and which still needs a development-guild check.

## External actions and handoff

- Before starting the bot, registering commands, running live provider calls, or applying remote migrations, confirm the intended development environment and that those actions are authorised. Starting the bot is not a harmless typecheck.
- Never expose tokens, `.env` contents, or Supabase secret keys. Do not deploy, publish releases, merge, or modify production data without authorisation. Respect the requested Git scope; a local fix does not imply a push or PR.
- When commits are requested, use Conventional Commits. Update relevant documentation when behavior or setup changes.
- Finish with a concise explanation of what changed, why, checks run and results, and any remaining limitations. Report failures and skipped checks honestly.
