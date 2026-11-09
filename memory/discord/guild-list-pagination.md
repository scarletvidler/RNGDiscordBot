# Guild list pagination
- ID: guild-list-pagination
- Domain: discord
- Status: done
- Updated: 2026-11-08

## Purpose and user intent
On 2026-11-08, the user requested that `bot/api/getGuilds.ts` loop when more guilds are available. Previously it fetched only one page.

## Current understanding
The implementation requests pages of 200 guilds, passing the last guild ID as `after`, and combines pages until a short or empty page arrives. It validates guild IDs and rejects repeated cursors to avoid looping indefinitely. Fetch or response errors retain the existing empty-array behavior rather than returning partial results.

## Evidence and related topics
- Parent agent verified the implementation in `bot/api/getGuilds.ts` on 2026-11-08.
- `tests/bot/api/getGuilds.test.ts` mocks REST requests and covers 0, 1, 200, and 401 guilds, plus later-page request errors, invalid responses, missing IDs, and repeated cursors.
- Parent-reported verification: `npm run test:bot` passed 18/18 tests; `npm run typecheck:bot` passed; `git diff --check` passed. No bot startup or live Discord API calls were performed.
- [Official Discord user resource documentation](https://github.com/discord/discord-api-docs/blob/main/developers/resources/user.mdx), consulted by the parent on 2026-11-08, documents the maximum page limit of 200 and the `after` cursor.
- No lasting preference changes were identified; existing preferences remain in [PREFERENCES.md](../../PREFERENCES.md).
