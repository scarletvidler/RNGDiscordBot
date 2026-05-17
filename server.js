// server.ts
import "dotenv/config";
import { createRequestHandler } from "@remix-run/node";
import * as build from "./build/server/index.js"; // 👈 explicit file + extension
import http from "http";
import { startBot } from "./bot/bot.server.ts"; // use .ts in dev with ts-node, .js in prod

const PORT = process.env.PORT || 4000;

startBot().catch(console.error);

const server = http.createServer(
  createRequestHandler({
    build,
    mode: process.env.NODE_ENV,
  }),
);

server.listen(PORT, () => {
  console.log(`✅ Remix server running at http://localhost:${PORT}`);
});
