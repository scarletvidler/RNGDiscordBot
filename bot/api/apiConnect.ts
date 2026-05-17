// Basic wrapper file for the REST API client from discord.js, to centralize the token handling and any future API-related setup.

import { REST } from "discord.js";

export function apiConnect(token: string): REST {
    console.log("API connected");
    const rest = new REST({ version: "10" }).setToken(token);
    return rest;    
}