import { Client, Collection, Guild } from "discord.js";
import type {
  ChatInputCommandInteraction,
  SlashCommandOptionsOnlyBuilder,
  VoiceBasedChannel,
} from "discord.js";
import type { DBGuildWithSettings } from "../supabase/models/guilds.ts";
import type VoiceInstance from "./modules/voice/VoiceInstance.ts";
import VoicePlayer from "./modules/voice/VoicePlayer.ts";

export enum TTSModels {
  ElevenLabsV3 = "eleven_v3",
  ElevenLabsFlashV2_5 = "eleven_flash_v2_5",
  Fish = "fishAI (DOES NOT WORK YET!!!)",
}

export type channelWithPlayer = VoiceBasedChannel & {
  player?: VoicePlayer;
};
export interface BotCommand {
  guildId?: string;
  data: SlashCommandOptionsOnlyBuilder;
  requirements?: {
    userPermissions?: string[];
  };
  execute(
    interaction: ChatInputCommandInteraction,
    client: ExtendedClient,
    guild: DBGuildWithSettings,
  ): Promise<void>;
}

export interface BotEvent<TArgs extends unknown[] = unknown[]> {
  type: string;
  execute(...args: TArgs): Promise<void> | void;
}

export type APIGuild = {
  id: string;
  name: string;
};

export class ExtendedClient extends Client {
  ownerId!: string;
  femaleRoleId!: string;
  maleRoleId!: string;
  ttsChannelName!: string;
  idleTimeout!: number;
  prefix!: string;
  commands: Collection<string, BotCommand>;
  installedGuilds!: DBGuildWithSettings[];
  activeVoiceConnections: Map<Guild["id"], VoiceInstance> = new Map();
  constructor(options: any) {
    super(options);
    this.commands = new Collection();
    this.activeVoiceConnections = new Map();
  }
}

export interface ExtendedGuild extends Guild {
  settings: {
    tts: {
      repliesEnabled: boolean;
      roomPrefixEnabled: boolean;
      femaleVoiceId: string;
      maleVoiceId: string;
      ttsChannelName: string;
      idleTimeout: number;
    };
  };
  logging: {
    messageCount: number;
    tokenTotalUsage: number;
    tokenBalance: number;
    tokenLimit: number;
  };
}

declare module "discord.js" {
  interface Client {
    commands: Collection<string, BotCommand>;
  }
}
