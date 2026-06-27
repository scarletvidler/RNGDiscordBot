export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      discord_users: {
        Row: {
          id: string;
          username: string;
          global_name: string | null;
          avatar_url: string | null;
          is_bot: boolean;
          first_seen_at: string;
          last_seen_at: string;
        };
        Insert: {
          id: string;
          username: string;
          global_name?: string | null;
          avatar_url?: string | null;
          is_bot?: boolean;
          first_seen_at?: string;
          last_seen_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["discord_users"]["Insert"]>;
        Relationships: [];
      };
      guilds: {
        Row: {
          id: string;
          name: string;
          owner_id: string | null;
          icon_url: string | null;
          joined_at: string;
          left_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          name: string;
          owner_id?: string | null;
          icon_url?: string | null;
          joined_at?: string;
          left_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["guilds"]["Insert"]>;
        Relationships: [];
      };
      guild_tts_settings: {
        Row: {
          guild_id: string;
          replies_enabled: boolean;
          room_prefix_enabled: boolean;
          tts_channel_name: string;
          female_voice_id: string | null;
          male_voice_id: string | null;
          idle_timeout_seconds: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          guild_id: string;
          replies_enabled?: boolean;
          room_prefix_enabled?: boolean;
          tts_channel_name?: string;
          female_voice_id?: string | null;
          male_voice_id?: string | null;
          idle_timeout_seconds?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["guild_tts_settings"]["Insert"]>;
        Relationships: [];
      };
      guild_command_settings: {
        Row: {
          id: string;
          guild_id: string;
          command_name: string;
          enabled: boolean;
          settings: Json;
          updated_by_user_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          guild_id: string;
          command_name: string;
          enabled?: boolean;
          settings?: Json;
          updated_by_user_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["guild_command_settings"]["Insert"]>;
        Relationships: [];
      };
      guild_chat_logs: {
        Row: {
          id: string;
          guild_id: string;
          channel_id: string;
          voice_channel_id: string | null;
          user_id: string | null;
          message_id: string | null;
          raw_message: string;
          spoken_message: string | null;
          tts_mode: "channel" | "room_prefix";
          created_at: string;
        };
        Insert: {
          id?: string;
          guild_id: string;
          channel_id: string;
          voice_channel_id?: string | null;
          user_id?: string | null;
          message_id?: string | null;
          raw_message: string;
          spoken_message?: string | null;
          tts_mode?: "channel" | "room_prefix";
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["guild_chat_logs"]["Insert"]>;
        Relationships: [];
      };
      guild_members: {
        Row: {
          guild_id: string;
          user_id: string;
          display_name: string | null;
          roles: Json;
          joined_at: string | null;
          first_seen_at: string;
          last_seen_at: string;
        };
        Insert: {
          guild_id: string;
          user_id: string;
          display_name?: string | null;
          roles?: Json;
          joined_at?: string | null;
          first_seen_at?: string;
          last_seen_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["guild_members"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
