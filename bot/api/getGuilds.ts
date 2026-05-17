import { apiConnect } from "./apiConnect.ts";



export async function getGuilds(token: string) {
    const rest = apiConnect(token);

    try {
        const guilds = await rest.get("/users/@me/guilds");
        return guilds;
    } catch (error) {
        console.error("Error fetching guilds:", error);
        return [];
    }
}