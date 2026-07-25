import type { ExtendedClient } from "../../types.ts";
import { registerSlashCommands } from "../../modules/registerSlashCommands.ts";

export async function registerGuildCommands(
  client: ExtendedClient,
  guildId: string,
): Promise<void> {
  await registerSlashCommands(
    client,
    process.env.CLIENT_ID!,
    [guildId],
    process.env.BOT_TOKEN!,
  );
}
