export interface DBGuildTtsSettings {
  repliesEnabled: boolean;
  roomPrefixEnabled: boolean;
  ttsChannelName: string;
  femaleVoiceId: string;
  maleVoiceId: string;
  idleTimeout: number;
}
export interface DBGuild {
  id: string;
  name: string;
  owner_id: string | null;
  message_count: number;
  token_total_usage: number;
  token_balance: number;
  token_limit: number;
  joined_at: string;
  left_at: string | null;
  created_at: string;
  updated_at: string;
}
