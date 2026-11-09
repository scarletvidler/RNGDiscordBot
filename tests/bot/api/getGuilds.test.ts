import assert from "node:assert/strict";
import test from "node:test";
import { REST } from "discord.js";
import { getGuilds } from "../../../bot/api/getGuilds.ts";

const makeGuilds = (start: number, count: number) =>
  Array.from({ length: count }, (_, index) => ({
    id: String(BigInt("100000000000000000") + BigInt(start + index)),
    name: `Guild ${start + index}`,
  }));

for (const count of [0, 1, 200, 401]) {
  test(`fetches all ${count} guilds and stops at the final page`, async (t) => {
    const guilds = makeGuilds(0, count);
    let calls = 0;
    t.mock.method(REST.prototype, "get", async (route: string, options: { query: URLSearchParams }) => {
      assert.equal(route, "/users/@me/guilds");
      assert.equal(options.query.get("limit"), "200");
      const offset = calls * 200;
      assert.equal(options.query.get("after"), offset ? guilds[offset - 1].id : null);
      calls++;
      return guilds.slice(offset, offset + 200);
    });

    assert.deepEqual(await getGuilds("test-token"), guilds);
    assert.equal(calls, Math.floor(count / 200) + 1);
  });
}

for (const failure of ["request", "invalid", "missing ID", "repeated cursor"]) {
  test(`returns no partial results on ${failure} after a full page`, async (t) => {
    const page = makeGuilds(0, 200);
    let calls = 0;
    t.mock.method(console, "error", () => {});
    t.mock.method(REST.prototype, "get", async () => {
      calls++;
      if (calls === 1) return page;
      if (calls > 2) throw new Error("Pagination failed to stop");
      if (failure === "request") throw new Error("Request failed");
      if (failure === "invalid") return {};
      if (failure === "missing ID") return [{ name: "Invalid guild" }];
      return page;
    });

    assert.deepEqual(await getGuilds("test-token"), []);
    assert.equal(calls, 2);
  });
}
