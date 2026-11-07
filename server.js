// server.ts
import "dotenv/config";
import { startBot, stopBot } from "./bot/bot.server.ts"; // use .ts in dev with ts-node, .js in prod

const PORT = process.env.PORT || 4000;

startBot().catch(console.error);

let stopping = false;
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    if (stopping) return;
    stopping = true;
    const deadline = setTimeout(() => process.exit(1), 15_000);
    deadline.unref();
    stopBot().then(
      () => process.exit(0),
      () => {
        console.error("Bot shutdown failed");
        process.exit(1);
      },
    );
  });
}
