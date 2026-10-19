import { Api as TopGgApi } from "@top-gg/sdk";

let topGgApi: TopGgApi | undefined;
let configuredToken: string | undefined;

export function getTopGgApi(): TopGgApi | undefined {
  const token = process.env.TOPGG_TOKEN?.trim();
  if (!token) return undefined;

  if (!topGgApi || configuredToken !== token) {
    configuredToken = token;
    topGgApi = new TopGgApi(token);
  }

  return topGgApi;
}
