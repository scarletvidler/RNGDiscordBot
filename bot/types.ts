import { Client, Collection, Guild } from "discord.js";
import type {
  ChatInputCommandInteraction,
  SlashCommandOptionsOnlyBuilder,
  VoiceBasedChannel,
} from "discord.js";
import type { DBGuildWithSettings } from "../supabase/models/guilds.ts";
import type VoiceInstance from "./modules/voice/VoiceInstance.ts";
import VoicePlayer from "./modules/voice/VoicePlayer.ts";
import { DBVoiceRole, DBVoiceUser } from "../supabase/models/voice.ts";

export enum TTSModels {
  ElevenLabsV3 = "eleven_v3",
  ElevenLabsFlashV2_5 = "eleven_flash_v2_5",
  FishPro = "Fish: s2.1-pro",
}

export enum FishAudioModels {
  FishS1 = "s1",
  FishPro = "s2.1-pro",
  FishProFree = "s2.1-pro-free",
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

declare module "discord.js" {
  interface Client {
    commands: Collection<string, BotCommand>;
  }
}
