import { Client, Collection } from "discord.js";
import type {
  Channel,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";
import VoicePlayerClass from "./modules/VoicePlayer.ts";

export type channelWithPlayer = Channel & { player?: VoicePlayerClass };
export interface BotCommand {
  data:
    | SlashCommandBuilder
    | Omit<SlashCommandBuilder, "addSubcommand" | "addSubcommandGroup">;
  requirements?: {
    userPermissions?: string[];
  };
  execute(interaction: ChatInputCommandInteraction): Promise<void>;
}

export interface BotEvent<TArgs extends unknown[] = unknown[]> {
  type: string;
  execute(...args: TArgs): Promise<void> | void;
}

export class ExtendedClient extends Client {
  ownerId!: string;
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
