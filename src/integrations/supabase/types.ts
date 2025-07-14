export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instanciate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.3 (519615d)"
  }
  public: {
    Tables: {
      client_groups: {
        Row: {
          created_at: string | null
          id: string
          name: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      client_tasks: {
        Row: {
          client_id: string
          created_at: string | null
          description: string | null
          due_date: string | null
          id: string
          status: string | null
          title: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          client_id: string
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          status?: string | null
          title: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          client_id?: string
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          status?: string | null
          title?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          company: string | null
          created_at: string | null
          email: string | null
          funnel_stage: string | null
          group_id: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          profile_id: string | null
          source: string | null
          status: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          company?: string | null
          created_at?: string | null
          email?: string | null
          funnel_stage?: string | null
          group_id?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          profile_id?: string | null
          source?: string | null
          status?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          company?: string | null
          created_at?: string | null
          email?: string | null
          funnel_stage?: string | null
          group_id?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          profile_id?: string | null
          source?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "client_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_attendances: {
        Row: {
          attendant_id: string | null
          attended_at: string | null
          connection_id: string
          created_at: string | null
          id: string
          remote_jid: string
          status: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          attendant_id?: string | null
          attended_at?: string | null
          connection_id: string
          created_at?: string | null
          id?: string
          remote_jid: string
          status?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          attendant_id?: string | null
          attended_at?: string | null
          connection_id?: string
          created_at?: string | null
          id?: string
          remote_jid?: string
          status?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_attendances_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      evolution_api_configs: {
        Row: {
          api_url: string
          created_at: string
          global_key: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          api_url: string
          created_at?: string
          global_key: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          api_url?: string
          created_at?: string
          global_key?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      evolution_servers: {
        Row: {
          api_key: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          server_url: string
          updated_at: string
          user_id: string
        }
        Insert: {
          api_key: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          server_url: string
          updated_at?: string
          user_id: string
        }
        Update: {
          api_key?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          server_url?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      funnel_stages: {
        Row: {
          color: string
          created_at: string | null
          funnel_id: string
          id: string
          name: string
          order_position: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          color: string
          created_at?: string | null
          funnel_id: string
          id?: string
          name: string
          order_position: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string | null
          funnel_id?: string
          id?: string
          name?: string
          order_position?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "funnel_stages_funnel_id_fkey"
            columns: ["funnel_id"]
            isOneToOne: false
            referencedRelation: "sales_funnels"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_statuses: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      lead_tasks: {
        Row: {
          created_at: string | null
          description: string | null
          due_date: string | null
          id: string
          lead_id: string
          status: string | null
          title: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          lead_id: string
          status?: string | null
          title: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          lead_id?: string
          status?: string | null
          title?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_tasks_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          company: string | null
          created_at: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          profile_id: string | null
          source: string
          status: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          company?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          profile_id?: string | null
          source?: string
          status?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          company?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          profile_id?: string | null
          source?: string
          status?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_members: {
        Row: {
          created_at: string
          created_by: string
          id: string
          profile_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          profile_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          profile_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          company_name: string | null
          created_at: string
          first_name: string | null
          id: string
          last_name: string | null
          registration_complete: boolean | null
          updated_at: string
          whatsapp_connected: boolean | null
          whatsapp_number: string
        }
        Insert: {
          company_name?: string | null
          created_at?: string
          first_name?: string | null
          id: string
          last_name?: string | null
          registration_complete?: boolean | null
          updated_at?: string
          whatsapp_connected?: boolean | null
          whatsapp_number: string
        }
        Update: {
          company_name?: string | null
          created_at?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          registration_complete?: boolean | null
          updated_at?: string
          whatsapp_connected?: boolean | null
          whatsapp_number?: string
        }
        Relationships: []
      }
      registration_steps: {
        Row: {
          completed: boolean | null
          created_at: string
          id: string
          step_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed?: boolean | null
          created_at?: string
          id?: string
          step_name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed?: boolean | null
          created_at?: string
          id?: string
          step_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sales_funnels: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_default: boolean | null
          name: string
          profile_id: string | null
          source: string | null
          type: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_default?: boolean | null
          name: string
          profile_id?: string | null
          source?: string | null
          type: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_default?: boolean | null
          name?: string
          profile_id?: string | null
          source?: string | null
          type?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_funnels_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_permissions: {
        Row: {
          created_at: string
          created_by: string
          id: string
          permission: Database["public"]["Enums"]["permission_type"]
          profile_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          permission: Database["public"]["Enums"]["permission_type"]
          profile_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          permission?: Database["public"]["Enums"]["permission_type"]
          profile_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_permissions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_admin: boolean
          name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_admin?: boolean
          name: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_admin?: boolean
          name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      whatsapp_connections: {
        Row: {
          config_data: Json | null
          created_at: string
          id: string
          instance_name: string | null
          name: string | null
          phone_number: string | null
          qr_code: string | null
          status: string
          type: string | null
          updated_at: string
          user_id: string
          webhook_url: string | null
        }
        Insert: {
          config_data?: Json | null
          created_at?: string
          id?: string
          instance_name?: string | null
          name?: string | null
          phone_number?: string | null
          qr_code?: string | null
          status?: string
          type?: string | null
          updated_at?: string
          user_id: string
          webhook_url?: string | null
        }
        Update: {
          config_data?: Json | null
          created_at?: string
          id?: string
          instance_name?: string | null
          name?: string | null
          phone_number?: string | null
          qr_code?: string | null
          status?: string
          type?: string | null
          updated_at?: string
          user_id?: string
          webhook_url?: string | null
        }
        Relationships: []
      }
      whatsapp_webhook_events: {
        Row: {
          connection_name: string
          created_at: string
          event_data: Json
          id: string
          processed: boolean | null
          user_id: string
        }
        Insert: {
          connection_name: string
          created_at?: string
          event_data: Json
          id?: string
          processed?: boolean | null
          user_id: string
        }
        Update: {
          connection_name?: string
          created_at?: string
          event_data?: Json
          id?: string
          processed?: boolean | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_all_conversation_statuses: {
        Args: { p_user_id: string; p_connection_id: string }
        Returns: {
          id: string
          user_id: string
          connection_id: string
          remote_jid: string
          status: string
          attendant_id: string
          attended_at: string
          created_at: string
          updated_at: string
        }[]
      }
      get_conversation_status: {
        Args: {
          p_user_id: string
          p_connection_id: string
          p_remote_jid: string
        }
        Returns: {
          id: string
          user_id: string
          connection_id: string
          remote_jid: string
          status: string
          attendant_id: string
          attended_at: string
          created_at: string
          updated_at: string
        }[]
      }
      has_permission: {
        Args:
          | {
              profile_id: string
              perm: Database["public"]["Enums"]["permission_type"]
              user_id?: string
            }
          | { user_id: number; permission: string }
        Returns: boolean
      }
      is_profile_member: {
        Args:
          | { profile_id: string; user_id?: string }
          | { user_id: number; profile_id: number }
        Returns: boolean
      }
      upsert_conversation_status: {
        Args: {
          p_user_id: string
          p_connection_id: string
          p_remote_jid: string
          p_status: string
          p_attendant_id?: string
          p_attended_at?: string
          p_updated_at?: string
        }
        Returns: {
          id: string
          user_id: string
          connection_id: string
          remote_jid: string
          status: string
          attendant_id: string
          attended_at: string
          created_at: string
          updated_at: string
        }[]
      }
    }
    Enums: {
      permission_type:
        | "all_access"
        | "manage_clients"
        | "view_clients"
        | "manage_leads"
        | "view_leads"
        | "manage_funnels"
        | "view_funnels"
        | "manage_settings"
        | "view_reports"
        | "manage_users"
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
  public: {
    Enums: {
      permission_type: [
        "all_access",
        "manage_clients",
        "view_clients",
        "manage_leads",
        "view_leads",
        "manage_funnels",
        "view_funnels",
        "manage_settings",
        "view_reports",
        "manage_users",
      ],
    },
  },
} as const
