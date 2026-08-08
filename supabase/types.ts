export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      discord_users: {
        Row: {
          avatar_url: string | null
          first_seen_at: string
          global_name: string | null
          id: string
          is_bot: boolean
          last_seen_at: string
          username: string
        }
        Insert: {
          avatar_url?: string | null
          first_seen_at?: string
          global_name?: string | null
          id: string
          is_bot?: boolean
          last_seen_at?: string
          username: string
        }
        Update: {
          avatar_url?: string | null
          first_seen_at?: string
          global_name?: string | null
          id?: string
          is_bot?: boolean
          last_seen_at?: string
          username?: string
        }
        Relationships: []
      }
      guild_chat_logs: {
        Row: {
          channel_id: string
          created_at: string
          guild_id: string
          id: string
          message_id: string | null
          raw_message: string
          spoken_message: string | null
          tts_mode: string
          user_id: string | null
          voice_channel_id: string | null
        }
        Insert: {
          channel_id: string
          created_at?: string
          guild_id: string
          id?: string
          message_id?: string | null
          raw_message: string
          spoken_message?: string | null
          tts_mode?: string
          user_id?: string | null
          voice_channel_id?: string | null
        }
        Update: {
          channel_id?: string
          created_at?: string
          guild_id?: string
          id?: string
          message_id?: string | null
          raw_message?: string
          spoken_message?: string | null
          tts_mode?: string
          user_id?: string | null
          voice_channel_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guild_chat_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "discord_users"
            referencedColumns: ["id"]
          },
        ]
      }
      guild_members: {
        Row: {
          display_name: string | null
          first_seen_at: string
          guild_id: string
          joined_at: string | null
          last_seen_at: string
          roles: Json
          user_id: string
        }
        Insert: {
          display_name?: string | null
          first_seen_at?: string
          guild_id: string
          joined_at?: string | null
          last_seen_at?: string
          roles?: Json
          user_id: string
        }
        Update: {
          display_name?: string | null
          first_seen_at?: string
          guild_id?: string
          joined_at?: string | null
          last_seen_at?: string
          roles?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "guild_members_guild_id_fkey"
            columns: ["guild_id"]
            isOneToOne: false
            referencedRelation: "guilds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guild_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "discord_users"
            referencedColumns: ["id"]
          },
        ]
      }
      guild_tts_settings: {
        Row: {
          created_at: string
          elevenlabs_female_voice_id: string | null
          elevenlabs_male_voice_id: string | null
          fisher_female_voice_id: string | null
          fisher_male_voice_id: string | null
          guild_id: string
          idle_timeout_seconds: number
          replies_enabled: boolean
          room_prefix_enabled: boolean
          tts_channel_name: string
          tts_ping_sound_enabled: boolean
          tts_provider: string
          tts_provider_api_key: string | null
          tts_say_users_name: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          elevenlabs_female_voice_id?: string | null
          elevenlabs_male_voice_id?: string | null
          fisher_female_voice_id?: string | null
          fisher_male_voice_id?: string | null
          guild_id: string
          idle_timeout_seconds?: number
          replies_enabled?: boolean
          room_prefix_enabled?: boolean
          tts_channel_name?: string
          tts_ping_sound_enabled?: boolean
          tts_provider?: string
          tts_provider_api_key?: string | null
          tts_say_users_name?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          elevenlabs_female_voice_id?: string | null
          elevenlabs_male_voice_id?: string | null
          fisher_female_voice_id?: string | null
          fisher_male_voice_id?: string | null
          guild_id?: string
          idle_timeout_seconds?: number
          replies_enabled?: boolean
          room_prefix_enabled?: boolean
          tts_channel_name?: string
          tts_ping_sound_enabled?: boolean
          tts_provider?: string
          tts_provider_api_key?: string | null
          tts_say_users_name?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      guild_voices: {
        Row: {
          created_at: string
          guild_id: string
          owner_id: string
          owner_type: Database["public"]["Enums"]["voice_owner_type"]
          voice_id: string
          voice_name: string
          voice_provider: string
        }
        Insert: {
          created_at?: string
          guild_id: string
          owner_id: string
          owner_type?: Database["public"]["Enums"]["voice_owner_type"]
          voice_id: string
          voice_name: string
          voice_provider?: string
        }
        Update: {
          created_at?: string
          guild_id?: string
          owner_id?: string
          owner_type?: Database["public"]["Enums"]["voice_owner_type"]
          voice_id?: string
          voice_name?: string
          voice_provider?: string
        }
        Relationships: [
          {
            foreignKeyName: "guild_voices_guild_id_fkey"
            columns: ["guild_id"]
            isOneToOne: false
            referencedRelation: "guilds"
            referencedColumns: ["id"]
          },
        ]
      }
      guilds: {
        Row: {
          created_at: string
          id: string
          joined_at: string
          left_at: string | null
          message_count: number
          name: string
          owner_id: string | null
          token_balance: number
          token_limit: number
          token_total_usage: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          joined_at?: string
          left_at?: string | null
          message_count?: number
          name: string
          owner_id?: string | null
          token_balance?: number
          token_limit?: number
          token_total_usage?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          joined_at?: string
          left_at?: string | null
          message_count?: number
          name?: string
          owner_id?: string | null
          token_balance?: number
          token_limit?: number
          token_total_usage?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "guilds_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "discord_users"
            referencedColumns: ["id"]
          },
        ]
      }
      pokemon: {
        Row: {
          capture_rate: number | null
          created_at: string
          flavor_text: string | null
          form_id: number
          form_name: string | null
          gender_rate: number | null
          handle: string
          height: number | null
          id: number
          is_baby: boolean
          is_legendary: boolean
          is_mythical: boolean
          name: string
          pokedex_id: number
          sprites: Json | null
          weight: number | null
        }
        Insert: {
          capture_rate?: number | null
          created_at?: string
          flavor_text?: string | null
          form_id: number
          form_name?: string | null
          gender_rate?: number | null
          handle: string
          height?: number | null
          id?: number
          is_baby?: boolean
          is_legendary?: boolean
          is_mythical?: boolean
          name: string
          pokedex_id: number
          sprites?: Json | null
          weight?: number | null
        }
        Update: {
          capture_rate?: number | null
          created_at?: string
          flavor_text?: string | null
          form_id?: number
          form_name?: string | null
          gender_rate?: number | null
          handle?: string
          height?: number | null
          id?: number
          is_baby?: boolean
          is_legendary?: boolean
          is_mythical?: boolean
          name?: string
          pokedex_id?: number
          sprites?: Json | null
          weight?: number | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_pokemon: {
        Row: {
          created_at: string
          guild_id: string
          id: string
          pokemon_id: number
          shiny: boolean
          user_id: string
        }
        Insert: {
          created_at?: string
          guild_id: string
          id?: string
          pokemon_id: number
          shiny?: boolean
          user_id: string
        }
        Update: {
          created_at?: string
          guild_id?: string
          id?: string
          pokemon_id?: number
          shiny?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_pokemon_guild_id_user_id_fkey"
            columns: ["guild_id", "user_id"]
            isOneToOne: false
            referencedRelation: "guild_members"
            referencedColumns: ["guild_id", "user_id"]
          },
          {
            foreignKeyName: "user_pokemon_pokemon_id_fkey"
            columns: ["pokemon_id"]
            isOneToOne: false
            referencedRelation: "pokemon"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      voice_owner_type: "user" | "role"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      voice_owner_type: ["user", "role"],
    },
  },
} as const

