export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      app_users: {
        Row: {
          created_at: string
          dept_id: string | null
          email: string
          id: string
          password: string
          status: string
          updated_at: string
          username: string
        }
        Insert: {
          created_at?: string
          dept_id?: string | null
          email: string
          id?: string
          password: string
          status?: string
          updated_at?: string
          username: string
        }
        Update: {
          created_at?: string
          dept_id?: string | null
          email?: string
          id?: string
          password?: string
          status?: string
          updated_at?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_users_dept_id_fkey"
            columns: ["dept_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          created_at: string
          dept_name: string
          id: string
          location: string | null
          org_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          dept_name: string
          id?: string
          location?: string | null
          org_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          dept_name?: string
          id?: string
          location?: string | null
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "departments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      flow_states: {
        Row: {
          assigned_role: string | null
          created_at: string
          flow_id: string
          id: string
          process_name: string
          state: string
          updated_at: string
          visible_to: string[] | null
        }
        Insert: {
          assigned_role?: string | null
          created_at?: string
          flow_id: string
          id?: string
          process_name: string
          state: string
          updated_at?: string
          visible_to?: string[] | null
        }
        Update: {
          assigned_role?: string | null
          created_at?: string
          flow_id?: string
          id?: string
          process_name?: string
          state?: string
          updated_at?: string
          visible_to?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "flow_states_assigned_role_fkey"
            columns: ["assigned_role"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["role_name"]
          },
        ]
      }
      flow_transitions: {
        Row: {
          created_at: string
          flow_id: string
          from_state: string
          id: string
          label_name: string
          to_state: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          flow_id: string
          from_state: string
          id?: string
          label_name: string
          to_state: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          flow_id?: string
          from_state?: string
          id?: string
          label_name?: string
          to_state?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "flow_transitions_flow_id_fkey"
            columns: ["flow_id"]
            isOneToOne: false
            referencedRelation: "flow_states"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          address: string | null
          city: string
          country: string
          created_at: string
          id: string
          name: string
          org_id: string
          postal_code: string
          state: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          city: string
          country: string
          created_at?: string
          id?: string
          name: string
          org_id: string
          postal_code: string
          state: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string
          country?: string
          created_at?: string
          id?: string
          name?: string
          org_id?: string
          postal_code?: string
          state?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "locations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          address: string | null
          created_at: string
          id: string
          legal_name: string
          org_name: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          id?: string
          legal_name: string
          org_name: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          id?: string
          legal_name?: string
          org_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      purchase_line_items: {
        Row: {
          cost_center: string | null
          created_at: string
          id: string
          item_code: string
          item_description: string
          item_image: string | null
          item_total: number
          pr_id: string
          quantity: number
          rate: number
          updated_at: string
        }
        Insert: {
          cost_center?: string | null
          created_at?: string
          id?: string
          item_code: string
          item_description: string
          item_image?: string | null
          item_total: number
          pr_id: string
          quantity: number
          rate: number
          updated_at?: string
        }
        Update: {
          cost_center?: string | null
          created_at?: string
          id?: string
          item_code?: string
          item_description?: string
          item_image?: string | null
          item_total?: number
          pr_id?: string
          quantity?: number
          rate?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_line_items_pr_id_fkey"
            columns: ["pr_id"]
            isOneToOne: false
            referencedRelation: "purchase_requisitions"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_requisitions: {
        Row: {
          attachments: string[] | null
          budget_level: string | null
          budget_line: string | null
          budget_period: string | null
          cost_center: string | null
          created_at: string
          deliver_to: string
          delivery_location: string
          id: string
          is_budgeted: boolean
          is_for_project: boolean
          legal_entity: string
          on_behalf_of: boolean
          on_behalf_of_department: string | null
          on_behalf_of_user: string | null
          pr_date: string
          pr_number: string
          pr_status: string
          project_name: string | null
          purchase_reason: string
          purchase_total: number
          requester: string
          requester_department: string
          updated_at: string
        }
        Insert: {
          attachments?: string[] | null
          budget_level?: string | null
          budget_line?: string | null
          budget_period?: string | null
          cost_center?: string | null
          created_at?: string
          deliver_to: string
          delivery_location: string
          id?: string
          is_budgeted?: boolean
          is_for_project?: boolean
          legal_entity: string
          on_behalf_of?: boolean
          on_behalf_of_department?: string | null
          on_behalf_of_user?: string | null
          pr_date?: string
          pr_number: string
          pr_status?: string
          project_name?: string | null
          purchase_reason: string
          purchase_total?: number
          requester: string
          requester_department: string
          updated_at?: string
        }
        Update: {
          attachments?: string[] | null
          budget_level?: string | null
          budget_line?: string | null
          budget_period?: string | null
          cost_center?: string | null
          created_at?: string
          deliver_to?: string
          delivery_location?: string
          id?: string
          is_budgeted?: boolean
          is_for_project?: boolean
          legal_entity?: string
          on_behalf_of?: boolean
          on_behalf_of_department?: string | null
          on_behalf_of_user?: string | null
          pr_date?: string
          pr_number?: string
          pr_status?: string
          project_name?: string | null
          purchase_reason?: string
          purchase_total?: number
          requester?: string
          requester_department?: string
          updated_at?: string
        }
        Relationships: []
      }
      roles: {
        Row: {
          created_at: string
          email: string
          id: string
          role_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          role_name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          role_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "app_users"
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
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DefaultSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
