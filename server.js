// server.ts
import "dotenv/config";
import { startBot } from "./bot/bot.server.ts"; // use .ts in dev with ts-node, .js in prod

const PORT = process.env.PORT || 4000;

startBot().catch(console.error);
