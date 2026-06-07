import { Client, Collection } from "discord.js";
import type { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";

export interface BotCommand {
  data: SlashCommandBuilder | Omit<SlashCommandBuilder, "addSubcommand" | "addSubcommandGroup">;
  execute(interaction: ChatInputCommandInteraction): Promise<void>;
}

export interface BotEvent<TArgs extends unknown[] = unknown[]> {
  type: string;
  execute(...args: TArgs): Promise<void> | void;
}

export class ExtendedClient extends Client {
  ownerId!: string;
  mochiId!: string;
  lercheRoleId!: string;
  ameliaRoleId!: string;
  femaleRoleId!: string;
  maleRoleId!: string;
  ttsChannelName!: string;
  defaultVoiceId!: string;
  idleTimeout!: number;
  prefix!: string;
  commands: Collection<string, BotCommand>;

  constructor(options: any) {
    super(options);
    this.commands = new Collection();
  }
}

declare module "discord.js" {
  interface Client {
    commands: Collection<string, BotCommand>;
  }
}
