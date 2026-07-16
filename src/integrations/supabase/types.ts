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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activity_logs: {
        Row: {
          action: string
          created_at: string
          department_id: string | null
          department_name: string | null
          description: string
          id: string
          legal_entity_id: string | null
          legal_entity_name: string | null
          office_site_id: string | null
          office_site_name: string | null
          sensitivity: string | null
          serial_number: string | null
          target_id: string | null
          target_type: string | null
          user_id: string
          user_name: string | null
        }
        Insert: {
          action: string
          created_at?: string
          department_id?: string | null
          department_name?: string | null
          description: string
          id?: string
          legal_entity_id?: string | null
          legal_entity_name?: string | null
          office_site_id?: string | null
          office_site_name?: string | null
          sensitivity?: string | null
          serial_number?: string | null
          target_id?: string | null
          target_type?: string | null
          user_id: string
          user_name?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          department_id?: string | null
          department_name?: string | null
          description?: string
          id?: string
          legal_entity_id?: string | null
          legal_entity_name?: string | null
          office_site_id?: string | null
          office_site_name?: string | null
          sensitivity?: string | null
          serial_number?: string | null
          target_id?: string | null
          target_type?: string | null
          user_id?: string
          user_name?: string | null
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      departments: {
        Row: {
          code: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          code?: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      documents: {
        Row: {
          assigned_to: string | null
          created_at: string
          department_id: string | null
          department_name: string | null
          document_title: string | null
          id: string
          legal_entity_id: string | null
          legal_entity_name: string | null
          office_site_id: string | null
          office_site_name: string | null
          original_filename: string
          pdf_data: string | null
          pdf_path: string
          sensitivity: string
          serial_number: string
          template_id: string
          template_name: string
          user_id: string
          user_name: string | null
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          department_id?: string | null
          department_name?: string | null
          document_title?: string | null
          id?: string
          legal_entity_id?: string | null
          legal_entity_name?: string | null
          office_site_id?: string | null
          office_site_name?: string | null
          original_filename: string
          pdf_data?: string | null
          pdf_path: string
          sensitivity?: string
          serial_number: string
          template_id: string
          template_name: string
          user_id: string
          user_name?: string | null
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          department_id?: string | null
          department_name?: string | null
          document_title?: string | null
          id?: string
          legal_entity_id?: string | null
          legal_entity_name?: string | null
          office_site_id?: string | null
          office_site_name?: string | null
          original_filename?: string
          pdf_data?: string | null
          pdf_path?: string
          sensitivity?: string
          serial_number?: string
          template_id?: string
          template_name?: string
          user_id?: string
          user_name?: string | null
        }
        Relationships: []
      }
      legal_entities: {
        Row: {
          code: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          code?: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      letterhead_templates: {
        Row: {
          address: string
          background_url: string
          company_name: string
          created_at: string
          email: string
          footer_border_style: string
          footer_text: string
          header_border_style: string
          header_font_size: string
          header_layout: string
          id: string
          is_default: boolean
          legal_entity_id: string | null
          logo_url: string
          name: string
          office_site_id: string | null
          overlay_config: Json
          phone: string
          reference_format: Json
          secondary_logo_url: string
          updated_at: string
          visibility: string
          watermark_default_on: boolean
          watermark_enabled: boolean
          watermark_image_url: string
          watermark_opacity: number
          watermark_pages: string
          watermark_type: string
          website: string
        }
        Insert: {
          address?: string
          background_url?: string
          company_name?: string
          created_at?: string
          email?: string
          footer_border_style?: string
          footer_text?: string
          header_border_style?: string
          header_font_size?: string
          header_layout?: string
          id?: string
          is_default?: boolean
          legal_entity_id?: string | null
          logo_url?: string
          name: string
          office_site_id?: string | null
          overlay_config?: Json
          phone?: string
          reference_format?: Json
          secondary_logo_url?: string
          updated_at?: string
          visibility?: string
          watermark_default_on?: boolean
          watermark_enabled?: boolean
          watermark_image_url?: string
          watermark_opacity?: number
          watermark_pages?: string
          watermark_type?: string
          website?: string
        }
        Update: {
          address?: string
          background_url?: string
          company_name?: string
          created_at?: string
          email?: string
          footer_border_style?: string
          footer_text?: string
          header_border_style?: string
          header_font_size?: string
          header_layout?: string
          id?: string
          is_default?: boolean
          legal_entity_id?: string | null
          logo_url?: string
          name?: string
          office_site_id?: string | null
          overlay_config?: Json
          phone?: string
          reference_format?: Json
          secondary_logo_url?: string
          updated_at?: string
          visibility?: string
          watermark_default_on?: boolean
          watermark_enabled?: boolean
          watermark_image_url?: string
          watermark_opacity?: number
          watermark_pages?: string
          watermark_type?: string
          website?: string
        }
        Relationships: []
      }
      office_sites: {
        Row: {
          code: string
          created_at: string
          id: string
          legal_entity_id: string
          name: string
        }
        Insert: {
          code?: string
          created_at?: string
          id?: string
          legal_entity_id: string
          name: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          legal_entity_id?: string
          name?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          approved_at: string | null
          banned_at: string | null
          created_at: string
          department_id: string | null
          full_name: string | null
          id: string
          legal_entity_id: string | null
          office_site_id: string | null
          onboarded: boolean
          tour_completed_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          approved_at?: string | null
          banned_at?: string | null
          created_at?: string
          department_id?: string | null
          full_name?: string | null
          id?: string
          legal_entity_id?: string | null
          office_site_id?: string | null
          onboarded?: boolean
          tour_completed_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          approved_at?: string | null
          banned_at?: string | null
          created_at?: string
          department_id?: string | null
          full_name?: string | null
          id?: string
          legal_entity_id?: string | null
          office_site_id?: string | null
          onboarded?: boolean
          tour_completed_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      role_definitions: {
        Row: {
          base_role: Database["public"]["Enums"]["app_role"]
          created_at: string
          created_by: string | null
          description: string
          id: string
          name: string
          permissions: Json
          scope_id: string | null
          scope_type: string
          updated_at: string
        }
        Insert: {
          base_role: Database["public"]["Enums"]["app_role"]
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          name: string
          permissions?: Json
          scope_id?: string | null
          scope_type?: string
          updated_at?: string
        }
        Update: {
          base_role?: Database["public"]["Enums"]["app_role"]
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          name?: string
          permissions?: Json
          scope_id?: string | null
          scope_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      serial_counters: {
        Row: {
          counter: number
          day: number
          dept: string
          id: string
          legal_entity: string
          month: number
          prefix: string
          site: string
          year: number
        }
        Insert: {
          counter?: number
          day?: number
          dept?: string
          id?: string
          legal_entity?: string
          month: number
          prefix: string
          site?: string
          year: number
        }
        Update: {
          counter?: number
          day?: number
          dept?: string
          id?: string
          legal_entity?: string
          month?: number
          prefix?: string
          site?: string
          year?: number
        }
        Relationships: []
      }
      user_role_assignments: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          id: string
          role_definition_id: string
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          id?: string
          role_definition_id: string
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          id?: string
          role_definition_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_role_assignments_role_definition_id_fkey"
            columns: ["role_definition_id"]
            isOneToOne: false
            referencedRelation: "role_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          scope_id: string | null
          scope_type: string
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          scope_id?: string | null
          scope_type?: string
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          scope_id?: string | null
          scope_type?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      approve_user: { Args: { _user_id: string }; Returns: undefined }
      generate_serial_number:
        | {
            Args: {
              _include_legal_entity?: boolean
              _include_month?: boolean
              _include_site?: boolean
              _include_timestamp?: boolean
              _legal_entity_code?: string
              _padding?: number
              _prefix?: string
              _separator?: string
              _site_code?: string
            }
            Returns: string
          }
        | {
            Args: {
              _dept_code?: string
              _include_legal_entity?: boolean
              _include_month?: boolean
              _include_site?: boolean
              _include_timestamp?: boolean
              _legal_entity_code?: string
              _padding?: number
              _prefix?: string
              _separator?: string
              _site_code?: string
            }
            Returns: string
          }
      get_user_department: { Args: { _user_id: string }; Returns: string }
      get_user_legal_entity: { Args: { _user_id: string }; Returns: string }
      get_user_site: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_role_scoped: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _scope_id: string
          _scope_type: string
          _user_id: string
        }
        Returns: boolean
      }
      is_active_user: { Args: { _user_id: string }; Returns: boolean }
      list_pending_approvals: {
        Args: never
        Returns: {
          created_at: string
          department_id: string
          department_name: string
          email: string
          full_name: string
          legal_entity_id: string
          legal_entity_name: string
          office_site_id: string
          office_site_name: string
          user_id: string
        }[]
      }
      log_activity: {
        Args: {
          _action: string
          _description: string
          _serial_number?: string
          _target_id?: string
          _target_type?: string
        }
        Returns: undefined
      }
      user_has_permission: {
        Args: { _permission: string; _user_id: string }
        Returns: boolean
      }
      user_in_scope: {
        Args: { _scope_id: string; _scope_type: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "manager" | "user"
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
      app_role: ["admin", "manager", "user"],
    },
  },
} as const
