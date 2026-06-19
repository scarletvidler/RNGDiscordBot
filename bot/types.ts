import { Client, Collection, Guild } from "discord.js";
import type {
  Channel,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
} from "discord.js";
import VoicePlayerClass from "./modules/VoicePlayer.ts";

export type channelWithPlayer = Channel & { player?: VoicePlayerClass };
export interface BotCommand {
  data: SlashCommandOptionsOnlyBuilder;
  execute(
    interaction: ChatInputCommandInteraction,
    client: ExtendedClient,
  ): Promise<void>;
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
  installedGuilds!: ExtendedGuild[];

  constructor(options: any) {
    super(options);
    this.commands = new Collection();
  }
}

export interface ExtendedGuild extends Guild {
  settings: {
    tts: {
      repliesEnabled: boolean;
      femaleVoiceId: string;
      maleVoiceId: string;
      ttsChannelName: string;
      idleTimeout: number;
    };
  };
}

declare module "discord.js" {
  interface Client {
    commands: Collection<string, BotCommand>;
  }
}
