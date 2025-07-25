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
    PostgrestVersion: "12.2.12 (cd3cf9e)"
  }
  public: {
    Tables: {
      clients: {
        Row: {
          id: string
          user_id: string
          full_name: string
          cpf: string
          phone: string
          address: string
          email: string | null
          photo_url: string | null
          document_photo_url: string | null
          residence_proof_url: string | null
          selfie_url: string | null
          credit_limit: number
          available_credit: number
          is_first_loan: boolean
          created_at: string
          total_borrowed: number | null
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          full_name: string
          cpf: string
          phone: string
          address: string
          email?: string | null
          photo_url?: string | null
          document_photo_url?: string | null
          residence_proof_url?: string | null
          selfie_url?: string | null
          credit_limit?: number
          available_credit?: number
          is_first_loan?: boolean
          created_at?: string
          total_borrowed?: number | null
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          full_name?: string
          cpf?: string
          phone?: string
          address?: string
          email?: string | null
          photo_url?: string | null
          document_photo_url?: string | null
          residence_proof_url?: string | null
          selfie_url?: string | null
          credit_limit?: number
          available_credit?: number
          is_first_loan?: boolean
          created_at?: string
          total_borrowed?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      client_references: {
        Row: {
          id: string
          client_id: string
          name: string
          phone: string
          relationship: string
          created_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          id?: string
          client_id: string
          name: string
          phone: string
          relationship: string
          created_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          id?: string
          client_id?: string
          name?: string
          phone?: string
          relationship?: string
          created_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_references_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          }
        ]
      }
      loan_payments: {
        Row: {
          created_at: string
          id: string
          loan_id: string
          payment_amount: number
          payment_date: string
          updated_at: string
          user_id: string
          week_number: number
        }
        Insert: {
          created_at?: string
          id?: string
          loan_id: string
          payment_amount: number
          payment_date?: string
          updated_at?: string
          user_id: string
          week_number: number
        }
        Update: {
          created_at?: string
          id?: string
          loan_id?: string
          payment_amount?: number
          payment_date?: string
          updated_at?: string
          user_id?: string
          week_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "loan_payments_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
        ]
      }
      loans: {
        Row: {
          client_id: string
          created_at: string
          description: string
          due_date: string | null
          id: string
          interest_rate: number | null
          loan_amount: number
          loan_date: string
          next_payment_date: string | null
          status: string
          total_amount: number
          total_weeks: number
          updated_at: string
          user_id: string
          weekly_payment: number
          weeks_paid: number | null
        }
        Insert: {
          client_id: string
          created_at?: string
          description: string
          due_date?: string | null
          id?: string
          interest_rate?: number | null
          loan_amount: number
          loan_date?: string
          next_payment_date?: string | null
          status?: string
          total_amount?: number
          total_weeks?: number
          updated_at?: string
          user_id: string
          weekly_payment?: number
          weeks_paid?: number | null
        }
        Update: {
          client_id?: string
          created_at?: string
          description?: string
          due_date?: string | null
          id?: string
          interest_rate?: number | null
          loan_amount?: number
          loan_date?: string
          next_payment_date?: string | null
          status?: string
          total_amount?: number
          total_weeks?: number
          updated_at?: string
          user_id?: string
          weekly_payment?: number
          weeks_paid?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "debts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          id: string
          name: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          name?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      calculate_next_payment_date: {
        Args: { loan_date: string; weeks_paid: number }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
