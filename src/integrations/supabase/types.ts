export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.3 (519615d)"
  }
  public: {
    Tables: {
      cart_items: {
        Row: {
          cart_id: string
          created_at: string | null
          id: string
          product_id: string
          quantity: number
          selected_variation: Json | null
          updated_at: string | null
        }
        Insert: {
          cart_id: string
          created_at?: string | null
          id?: string
          product_id: string
          quantity?: number
          selected_variation?: Json | null
          updated_at?: string | null
        }
        Update: {
          cart_id?: string
          created_at?: string | null
          id?: string
          product_id?: string
          quantity?: number
          selected_variation?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cart_items_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "shopping_carts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
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
      contract_events: {
        Row: {
          contract_id: string
          created_at: string
          created_by: string | null
          description: string
          event_type: string
          id: string
          metadata: Json | null
        }
        Insert: {
          contract_id: string
          created_at?: string
          created_by?: string | null
          description: string
          event_type: string
          id?: string
          metadata?: Json | null
        }
        Update: {
          contract_id?: string
          created_at?: string
          created_by?: string | null
          description?: string
          event_type?: string
          id?: string
          metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "contract_events_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_signers: {
        Row: {
          contract_id: string
          created_at: string
          email: string
          id: string
          name: string
          role: string
          signature_data: Json | null
          signed_at: string | null
          signing_order: number | null
        }
        Insert: {
          contract_id: string
          created_at?: string
          email: string
          id?: string
          name: string
          role: string
          signature_data?: Json | null
          signed_at?: string | null
          signing_order?: number | null
        }
        Update: {
          contract_id?: string
          created_at?: string
          email?: string
          id?: string
          name?: string
          role?: string
          signature_data?: Json | null
          signed_at?: string | null
          signing_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "contract_signers_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_templates: {
        Row: {
          content_html: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
          user_id: string
          variables_schema: Json | null
        }
        Insert: {
          content_html: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
          user_id: string
          variables_schema?: Json | null
        }
        Update: {
          content_html?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
          user_id?: string
          variables_schema?: Json | null
        }
        Relationships: []
      }
      contracts: {
        Row: {
          auto_renew: boolean | null
          client_id: string | null
          content: string | null
          content_html: string | null
          contract_number: string
          created_at: string
          currency: string | null
          end_date: string | null
          id: string
          linked_invoice_id: string | null
          linked_proposal_id: string | null
          renewal_period: number | null
          responsible_id: string | null
          signature_settings: Json | null
          start_date: string | null
          status: Database["public"]["Enums"]["contract_status"]
          tags: Json | null
          template_id: string | null
          title: string
          total_value: number | null
          updated_at: string
          user_id: string
          variables: Json | null
        }
        Insert: {
          auto_renew?: boolean | null
          client_id?: string | null
          content?: string | null
          content_html?: string | null
          contract_number: string
          created_at?: string
          currency?: string | null
          end_date?: string | null
          id?: string
          linked_invoice_id?: string | null
          linked_proposal_id?: string | null
          renewal_period?: number | null
          responsible_id?: string | null
          signature_settings?: Json | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["contract_status"]
          tags?: Json | null
          template_id?: string | null
          title: string
          total_value?: number | null
          updated_at?: string
          user_id: string
          variables?: Json | null
        }
        Update: {
          auto_renew?: boolean | null
          client_id?: string | null
          content?: string | null
          content_html?: string | null
          contract_number?: string
          created_at?: string
          currency?: string | null
          end_date?: string | null
          id?: string
          linked_invoice_id?: string | null
          linked_proposal_id?: string | null
          renewal_period?: number | null
          responsible_id?: string | null
          signature_settings?: Json | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["contract_status"]
          tags?: Json | null
          template_id?: string | null
          title?: string
          total_value?: number | null
          updated_at?: string
          user_id?: string
          variables?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "contracts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "contract_templates"
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
      order_items: {
        Row: {
          created_at: string | null
          id: string
          order_id: string
          product_id: string
          product_name: string
          product_type: string
          quantity: number
          selected_variation: Json | null
          total_price: number
          unit_price: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          order_id: string
          product_id: string
          product_name: string
          product_type: string
          quantity: number
          selected_variation?: Json | null
          total_price: number
          unit_price: number
        }
        Update: {
          created_at?: string | null
          id?: string
          order_id?: string
          product_id?: string
          product_name?: string
          product_type?: string
          quantity?: number
          selected_variation?: Json | null
          total_price?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          created_at: string | null
          customer_email: string
          customer_name: string
          customer_phone: string | null
          customer_user_id: string | null
          id: string
          notes: string | null
          order_number: string
          payment_method: string | null
          payment_status: string | null
          status: string
          store_user_id: string
          total_amount: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          customer_email: string
          customer_name: string
          customer_phone?: string | null
          customer_user_id?: string | null
          id?: string
          notes?: string | null
          order_number: string
          payment_method?: string | null
          payment_status?: string | null
          status?: string
          store_user_id: string
          total_amount: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          customer_email?: string
          customer_name?: string
          customer_phone?: string | null
          customer_user_id?: string | null
          id?: string
          notes?: string | null
          order_number?: string
          payment_method?: string | null
          payment_status?: string | null
          status?: string
          store_user_id?: string
          total_amount?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      products: {
        Row: {
          category: string | null
          contract_template: string | null
          cost: number | null
          created_at: string
          currency: string
          description: string | null
          discount_price: number | null
          duration_hours: number | null
          features: Json | null
          has_contract: boolean | null
          id: string
          images: Json | null
          is_public: boolean
          is_recurring: boolean | null
          min_stock_quantity: number | null
          name: string
          price: number | null
          recurrence_interval: string | null
          responsible_id: string | null
          secondary_images: Json | null
          short_description: string | null
          sku: string | null
          status: string
          stock_quantity: number | null
          type: string
          updated_at: string
          user_id: string
          variations: Json | null
        }
        Insert: {
          category?: string | null
          contract_template?: string | null
          cost?: number | null
          created_at?: string
          currency?: string
          description?: string | null
          discount_price?: number | null
          duration_hours?: number | null
          features?: Json | null
          has_contract?: boolean | null
          id?: string
          images?: Json | null
          is_public?: boolean
          is_recurring?: boolean | null
          min_stock_quantity?: number | null
          name: string
          price?: number | null
          recurrence_interval?: string | null
          responsible_id?: string | null
          secondary_images?: Json | null
          short_description?: string | null
          sku?: string | null
          status?: string
          stock_quantity?: number | null
          type: string
          updated_at?: string
          user_id: string
          variations?: Json | null
        }
        Update: {
          category?: string | null
          contract_template?: string | null
          cost?: number | null
          created_at?: string
          currency?: string
          description?: string | null
          discount_price?: number | null
          duration_hours?: number | null
          features?: Json | null
          has_contract?: boolean | null
          id?: string
          images?: Json | null
          is_public?: boolean
          is_recurring?: boolean | null
          min_stock_quantity?: number | null
          name?: string
          price?: number | null
          recurrence_interval?: string | null
          responsible_id?: string | null
          secondary_images?: Json | null
          short_description?: string | null
          sku?: string | null
          status?: string
          stock_quantity?: number | null
          type?: string
          updated_at?: string
          user_id?: string
          variations?: Json | null
        }
        Relationships: []
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
      project_lists: {
        Row: {
          created_at: string | null
          id: string
          name: string
          order_position: number
          project_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          order_position?: number
          project_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          order_position?: number
          project_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_lists_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_tasks: {
        Row: {
          assignee_id: string | null
          attachments: Json | null
          billable: boolean | null
          budget_cap: number | null
          checklist: Json | null
          created_at: string | null
          custom_fields: Json | null
          dependencies: Json | null
          description: string | null
          due_date: string | null
          end_time: string | null
          estimated_effort_hours: number | null
          estimated_story_points: number | null
          hourly_rate: number | null
          id: string
          list_id: string
          meeting_link: string | null
          meeting_location: string | null
          milestone_id: string | null
          parent_task_id: string | null
          priority: string | null
          project_id: string
          recurrence_rule: Json | null
          reminders: Json | null
          severity: string | null
          sprint_id: string | null
          start_date: string | null
          start_time: string | null
          status: string | null
          tags: Json | null
          task_type: string | null
          title: string
          updated_at: string | null
          user_id: string
          visibility: string | null
          watchers: Json | null
        }
        Insert: {
          assignee_id?: string | null
          attachments?: Json | null
          billable?: boolean | null
          budget_cap?: number | null
          checklist?: Json | null
          created_at?: string | null
          custom_fields?: Json | null
          dependencies?: Json | null
          description?: string | null
          due_date?: string | null
          end_time?: string | null
          estimated_effort_hours?: number | null
          estimated_story_points?: number | null
          hourly_rate?: number | null
          id?: string
          list_id: string
          meeting_link?: string | null
          meeting_location?: string | null
          milestone_id?: string | null
          parent_task_id?: string | null
          priority?: string | null
          project_id: string
          recurrence_rule?: Json | null
          reminders?: Json | null
          severity?: string | null
          sprint_id?: string | null
          start_date?: string | null
          start_time?: string | null
          status?: string | null
          tags?: Json | null
          task_type?: string | null
          title: string
          updated_at?: string | null
          user_id: string
          visibility?: string | null
          watchers?: Json | null
        }
        Update: {
          assignee_id?: string | null
          attachments?: Json | null
          billable?: boolean | null
          budget_cap?: number | null
          checklist?: Json | null
          created_at?: string | null
          custom_fields?: Json | null
          dependencies?: Json | null
          description?: string | null
          due_date?: string | null
          end_time?: string | null
          estimated_effort_hours?: number | null
          estimated_story_points?: number | null
          hourly_rate?: number | null
          id?: string
          list_id?: string
          meeting_link?: string | null
          meeting_location?: string | null
          milestone_id?: string | null
          parent_task_id?: string | null
          priority?: string | null
          project_id?: string
          recurrence_rule?: Json | null
          reminders?: Json | null
          severity?: string | null
          sprint_id?: string | null
          start_date?: string | null
          start_time?: string | null
          status?: string | null
          tags?: Json | null
          task_type?: string | null
          title?: string
          updated_at?: string | null
          user_id?: string
          visibility?: string | null
          watchers?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "project_tasks_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "project_lists"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "project_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_template_stages: {
        Row: {
          created_at: string
          id: string
          name: string
          offset_days: number
          order_position: number
          template_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          offset_days?: number
          order_position: number
          template_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          offset_days?: number
          order_position?: number
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_template_stages_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "project_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      project_template_tasks: {
        Row: {
          created_at: string
          description: string | null
          duration_days: number | null
          id: string
          offset_days: number
          priority: string | null
          role: string | null
          stage_id: string
          tags: Json | null
          title: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          duration_days?: number | null
          id?: string
          offset_days?: number
          priority?: string | null
          role?: string | null
          stage_id: string
          tags?: Json | null
          title: string
        }
        Update: {
          created_at?: string
          description?: string | null
          duration_days?: number | null
          id?: string
          offset_days?: number
          priority?: string | null
          role?: string | null
          stage_id?: string
          tags?: Json | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_template_tasks_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "project_template_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      project_templates: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          tags: Json | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          tags?: Json | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          tags?: Json | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      projects: {
        Row: {
          created_at: string | null
          description: string | null
          due_date: string | null
          id: string
          kanban_stage: string | null
          name: string
          status: string | null
          tags: Json | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          kanban_stage?: string | null
          name: string
          status?: string | null
          tags?: Json | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          kanban_stage?: string | null
          name?: string
          status?: string | null
          tags?: Json | null
          updated_at?: string | null
          user_id?: string
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
      shopping_carts: {
        Row: {
          created_at: string | null
          id: string
          session_id: string | null
          store_user_id: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          session_id?: string | null
          store_user_id: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          session_id?: string | null
          store_user_id?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      store_profiles: {
        Row: {
          contact_email: string | null
          contact_phone: string | null
          contact_whatsapp: string | null
          created_at: string
          id: string
          is_active: boolean
          store_description: string | null
          store_logo: string | null
          store_name: string
          store_slug: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          contact_email?: string | null
          contact_phone?: string | null
          contact_whatsapp?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          store_description?: string | null
          store_logo?: string | null
          store_name: string
          store_slug?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          contact_email?: string | null
          contact_phone?: string | null
          contact_whatsapp?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          store_description?: string | null
          store_logo?: string | null
          store_name?: string
          store_slug?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
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
      user_roles: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          profile_id: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          profile_id?: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          profile_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
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
        Args: { p_connection_id: string; p_user_id: string }
        Returns: {
          attendant_id: string
          attended_at: string
          connection_id: string
          created_at: string
          id: string
          remote_jid: string
          status: string
          updated_at: string
          user_id: string
        }[]
      }
      get_conversation_status: {
        Args: {
          p_connection_id: string
          p_remote_jid: string
          p_user_id: string
        }
        Returns: {
          attendant_id: string
          attended_at: string
          connection_id: string
          created_at: string
          id: string
          remote_jid: string
          status: string
          updated_at: string
          user_id: string
        }[]
      }
      has_permission: {
        Args:
          | {
              perm: Database["public"]["Enums"]["permission_type"]
              profile_id: string
              user_id?: string
            }
          | { permission: string; user_id: number }
        Returns: boolean
      }
      has_role: {
        Args: {
          _profile_id?: string
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_profile_member: {
        Args: { _profile_id: string; _user_id?: string }
        Returns: boolean
      }
      upsert_conversation_status: {
        Args: {
          p_attendant_id?: string
          p_attended_at?: string
          p_connection_id: string
          p_remote_jid: string
          p_status: string
          p_updated_at?: string
          p_user_id: string
        }
        Returns: {
          attendant_id: string
          attended_at: string
          connection_id: string
          created_at: string
          id: string
          remote_jid: string
          status: string
          updated_at: string
          user_id: string
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "manager" | "member" | "viewer"
      contract_status:
        | "DRAFT"
        | "PENDING_SIGNATURE"
        | "PARTIALLY_SIGNED"
        | "ACTIVE"
        | "INACTIVE"
        | "EXPIRED"
        | "CANCELLED"
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
      app_role: ["admin", "manager", "member", "viewer"],
      contract_status: [
        "DRAFT",
        "PENDING_SIGNATURE",
        "PARTIALLY_SIGNED",
        "ACTIVE",
        "INACTIVE",
        "EXPIRED",
        "CANCELLED",
      ],
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
