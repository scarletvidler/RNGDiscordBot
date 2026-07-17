import type { ExtendedClient } from "../../types.ts";
import { registerSlashCommands } from "../../modules/registerSlashCommands.ts";

export function registerGuildCommands(
  client: ExtendedClient,
  guildId: string,
): void {
  registerSlashCommands(
    client,
    process.env.CLIENT_ID!,
    [guildId],
    process.env.BOT_TOKEN!,
  );
}
