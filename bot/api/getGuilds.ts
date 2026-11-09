import type { APIGuild } from "../types.ts";
import { apiConnect } from "./apiConnect.ts";

export async function getGuilds(token: string): Promise<APIGuild[]> {
  const rest = apiConnect(token);

  try {
    const guilds: APIGuild[] = [];
    const limit = 200;
    const query = new URLSearchParams({ limit: String(limit) });
    const cursors = new Set<string>();

    while (true) {
      const page = await rest.get("/users/@me/guilds", { query });

      if (
        !Array.isArray(page) ||
        !page.every((guild) => guild && typeof guild.id === "string" && guild.id)
      ) {
        throw new Error(
          "Invalid response format: Expected an array of guild objects.",
        );
      }

      guilds.push(...page);
      if (page.length < limit) break;

      const after = page[page.length - 1].id;
      if (cursors.has(after)) {
        throw new Error("Guild pagination cursor did not advance.");
      }
      cursors.add(after);
      query.set("after", after);
    }

    return guilds;
  } catch (error) {
    console.error("Error fetching guilds:", error);
    return [];
  }
}
