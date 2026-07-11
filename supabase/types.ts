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
          profile_name: string | null;
          avatar_url: string | null;
          is_bot: boolean;
          first_seen_at: string;
          last_seen_at: string;
        };
        Insert: {
          id: string;
          username: string;
          profile_name?: string | null;
          avatar_url?: string | null;
          is_bot?: boolean;
          first_seen_at?: string;
          last_seen_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["discord_users"]["Insert"]
        >;
        Relationships: [];
      };
      guilds: {
        Row: {
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
        };
        Insert: {
          id: string;
          name: string;
          owner_id?: string | null;
          message_count?: number;
          token_total_usage?: number;
          token_balance?: number;
          token_limit?: number;
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
        Update: Partial<
          Database["public"]["Tables"]["guild_tts_settings"]["Insert"]
        >;
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
        Update: Partial<
          Database["public"]["Tables"]["guild_command_settings"]["Insert"]
        >;
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
        Update: Partial<
          Database["public"]["Tables"]["guild_chat_logs"]["Insert"]
        >;
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
        Update: Partial<
          Database["public"]["Tables"]["guild_members"]["Insert"]
        >;
        Relationships: [];
      };
      pokemon: {
        Row: {
          id: number;
          handle: string;
          pokedex_id: number;
          form_id: number;
          name: string;
          form_name: string | null;
          sprites: Json | null;
          height: number | null;
          weight: number | null;
          capture_rate: number | null;
          gender_rate: number | null;
          is_baby: boolean;
          is_legendary: boolean;
          is_mythical: boolean;
          flavor_text: string | null;
          created_at: string;
        };
        Insert: {
          id?: number;
          handle: string;
          pokedex_id: number;
          form_id: number;
          name: string;
          form_name?: string | null;
          sprites?: Json | null;
          height?: number | null;
          weight?: number | null;
          capture_rate?: number | null;
          gender_rate?: number | null;
          is_baby?: boolean;
          is_legendary?: boolean;
          is_mythical?: boolean;
          flavor_text?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["pokemon"]["Insert"]>;
        Relationships: [];
      };
      pokemon_profiles: {
        Row: {
          id: string;
          created_at: string;
          discord_user_id: string;
          guild_id: string;
          last_rolled_at: string | null;
        };
        Insert: {
          id?: string;
          created_at?: string;
          discord_user_id: string;
          guild_id: string;
          last_rolled_at?: string | null;
        };
        Update: Partial<
          Database["public"]["Tables"]["pokemon_profiles"]["Insert"]
        >;
        Relationships: [];
      };
      user_pokemon: {
        Row: {
          id: string;
          created_at: string;
          profile_id: string;
          pokemon_id: number;
          shiny: boolean;
        };
        Insert: {
          id?: string;
          created_at?: string;
          profile_id: string;
          pokemon_id: number;
          shiny?: boolean;
        };
        Update: Partial<Database["public"]["Tables"]["user_pokemon"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
