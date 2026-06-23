import { Guild } from "discord.js";
import { apiConnect } from "./apiConnect.ts";

export async function getGuilds(token: string): Promise<Guild[]> {
  const rest = apiConnect(token);

  try {
    const guilds = await rest.get("/users/@me/guilds");

    //  Check if the response is an array and contains guild objects
    if (!Array.isArray(guilds) || !guilds.every((guild) => guild)) {
      throw new Error(
        "Invalid response format: Expected an array of guild objects.",
      );
    }

    return guilds;
  } catch (error) {
    console.error("Error fetching guilds:", error);
    return [];
  }
}
