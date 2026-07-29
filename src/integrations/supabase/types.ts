export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          role: Database["public"]["Enums"]["user_role"];
          manager_id: string | null;
          created_at: string;
          updated_at: string | null;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          role?: Database["public"]["Enums"]["user_role"];
          manager_id?: string | null;
          created_at?: string;
          updated_at?: string | null;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string | null;
          role?: Database["public"]["Enums"]["user_role"];
          manager_id?: string | null;
          created_at?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "users_manager_id_fkey";
            columns: ["manager_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      crm_leads: {
        Row: {
          id: string;
          user_id: string;
          organization: string;
          organization_norm: string;
          website: string | null;
          email: string | null;
          phone: string | null;
          linkedin: string | null;
          cnpj: string | null;
          status: Database["public"]["Enums"]["crm_status"];
          source: Database["public"]["Enums"]["crm_source"];
          industry: string | null;
          segment: string | null;
          uf: string | null;
          municipio: string | null;
          fit: string | null;
          confianca: Database["public"]["Enums"]["crm_confianca"] | null;
          position: number;
          notes: string | null;
          converted: boolean;
          lost_reason: string | null;
          assigned_to: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          organization: string;
          organization_norm: string;
          website?: string | null;
          email?: string | null;
          phone?: string | null;
          linkedin?: string | null;
          cnpj?: string | null;
          status?: Database["public"]["Enums"]["crm_status"];
          source?: Database["public"]["Enums"]["crm_source"];
          industry?: string | null;
          segment?: string | null;
          uf?: string | null;
          municipio?: string | null;
          fit?: string | null;
          confianca?: Database["public"]["Enums"]["crm_confianca"] | null;
          position?: number;
          notes?: string | null;
          converted?: boolean;
          lost_reason?: string | null;
          assigned_to?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          organization?: string;
          organization_norm?: string;
          website?: string | null;
          email?: string | null;
          phone?: string | null;
          linkedin?: string | null;
          cnpj?: string | null;
          status?: Database["public"]["Enums"]["crm_status"];
          source?: Database["public"]["Enums"]["crm_source"];
          industry?: string | null;
          segment?: string | null;
          uf?: string | null;
          municipio?: string | null;
          fit?: string | null;
          confianca?: Database["public"]["Enums"]["crm_confianca"] | null;
          position?: number;
          notes?: string | null;
          converted?: boolean;
          lost_reason?: string | null;
          assigned_to?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "crm_leads_assigned_to_fkey";
            columns: ["assigned_to"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      crm_lead_notes: {
        Row: {
          id: string;
          lead_id: string;
          user_id: string;
          author_name: string | null;
          kind: Database["public"]["Enums"]["crm_note_kind"];
          content: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          lead_id: string;
          user_id: string;
          author_name?: string | null;
          kind?: Database["public"]["Enums"]["crm_note_kind"];
          content: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          lead_id?: string;
          user_id?: string;
          author_name?: string | null;
          kind?: Database["public"]["Enums"]["crm_note_kind"];
          content?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "crm_lead_notes_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "crm_leads";
            referencedColumns: ["id"];
          },
        ];
      };
      crm_lead_tasks: {
        Row: {
          id: string;
          lead_id: string;
          user_id: string;
          title: string;
          task_type: Database["public"]["Enums"]["crm_task_type"];
          due_at: string | null;
          done: boolean;
          done_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          lead_id: string;
          user_id: string;
          title: string;
          task_type?: Database["public"]["Enums"]["crm_task_type"];
          due_at?: string | null;
          done?: boolean;
          done_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          lead_id?: string;
          user_id?: string;
          title?: string;
          task_type?: Database["public"]["Enums"]["crm_task_type"];
          due_at?: string | null;
          done?: boolean;
          done_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "crm_lead_tasks_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "crm_leads";
            referencedColumns: ["id"];
          },
        ];
      };
      crm_lead_company_profiles: {
        Row: {
          id: string;
          lead_id: string;
          user_id: string;
          razao_social: string | null;
          nome_fantasia: string | null;
          cnpj: string | null;
          telefone_fixo: string | null;
          whatsapp: string | null;
          telefone_comercial: string | null;
          sac: string | null;
          email: string | null;
          site: string | null;
          linkedin: string | null;
          cidade: string | null;
          estado: string | null;
          segmento: string | null;
          porte: string | null;
          cnae: string | null;
          cnae_descricao: string | null;
          fonte_enriquecimento: string | null;
          contatos_origem: Json;
          raw_enrichment: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          lead_id: string;
          user_id: string;
          razao_social?: string | null;
          nome_fantasia?: string | null;
          cnpj?: string | null;
          telefone_fixo?: string | null;
          whatsapp?: string | null;
          telefone_comercial?: string | null;
          sac?: string | null;
          email?: string | null;
          site?: string | null;
          linkedin?: string | null;
          cidade?: string | null;
          estado?: string | null;
          segmento?: string | null;
          porte?: string | null;
          cnae?: string | null;
          cnae_descricao?: string | null;
          fonte_enriquecimento?: string | null;
          contatos_origem?: Json;
          raw_enrichment?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          lead_id?: string;
          user_id?: string;
          razao_social?: string | null;
          nome_fantasia?: string | null;
          cnpj?: string | null;
          telefone_fixo?: string | null;
          whatsapp?: string | null;
          telefone_comercial?: string | null;
          sac?: string | null;
          email?: string | null;
          site?: string | null;
          linkedin?: string | null;
          cidade?: string | null;
          estado?: string | null;
          segmento?: string | null;
          porte?: string | null;
          cnae?: string | null;
          cnae_descricao?: string | null;
          fonte_enriquecimento?: string | null;
          contatos_origem?: Json;
          raw_enrichment?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "crm_lead_company_profiles_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: true;
            referencedRelation: "crm_leads";
            referencedColumns: ["id"];
          },
        ];
      };
      crm_lead_decision_makers: {
        Row: {
          id: string;
          lead_id: string;
          user_id: string;
          name: string;
          title: string | null;
          area: Database["public"]["Enums"]["crm_decision_maker_area"] | null;
          priority: number;
          score: number;
          probabilidade_decisor: number | null;
          linkedin_url: string | null;
          employment_verified: boolean;
          source: string | null;
          evidence: string | null;
          commercial_context_hash: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          lead_id: string;
          user_id: string;
          name: string;
          title?: string | null;
          area?: Database["public"]["Enums"]["crm_decision_maker_area"] | null;
          priority?: number;
          score?: number;
          probabilidade_decisor?: number | null;
          linkedin_url?: string | null;
          employment_verified?: boolean;
          source?: string | null;
          evidence?: string | null;
          commercial_context_hash?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          lead_id?: string;
          user_id?: string;
          name?: string;
          title?: string | null;
          area?: Database["public"]["Enums"]["crm_decision_maker_area"] | null;
          priority?: number;
          score?: number;
          probabilidade_decisor?: number | null;
          linkedin_url?: string | null;
          employment_verified?: boolean;
          source?: string | null;
          evidence?: string | null;
          commercial_context_hash?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "crm_lead_decision_makers_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "crm_leads";
            referencedColumns: ["id"];
          },
        ];
      };
      intelligence_reports: {
        Row: {
          company_name: string;
          created_at: string;
          id: string;
          is_favorite: boolean;
          report: Json;
          source_lead_empresa: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          company_name: string;
          created_at?: string;
          id?: string;
          is_favorite?: boolean;
          report: Json;
          source_lead_empresa?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          company_name?: string;
          created_at?: string;
          id?: string;
          is_favorite?: boolean;
          report?: Json;
          source_lead_empresa?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      lead_feedback: {
        Row: {
          created_at: string;
          empresa: string;
          empresa_norm: string;
          id: string;
          rating: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          empresa: string;
          empresa_norm: string;
          id?: string;
          rating: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          empresa?: string;
          empresa_norm?: string;
          id?: string;
          rating?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      lead_history: {
        Row: {
          created_at: string;
          empresa: string;
          empresa_norm: string;
          id: string;
          segmento: string | null;
          uf: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          empresa: string;
          empresa_norm: string;
          id?: string;
          segmento?: string | null;
          uf?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          empresa?: string;
          empresa_norm?: string;
          id?: string;
          segmento?: string | null;
          uf?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      lead_search_cache: {
        Row: {
          created_at: string;
          filters: Json;
          filters_hash: string;
          id: string;
          results: Json;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          filters: Json;
          filters_hash: string;
          id?: string;
          results: Json;
          user_id: string;
        };
        Update: {
          created_at?: string;
          filters?: Json;
          filters_hash?: string;
          id?: string;
          results?: Json;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      user_role: "administrador" | "gestor_comercial" | "sdr";
      crm_status: "new" | "contacted" | "nurture" | "qualified" | "lost";
      crm_source: "prospeccao" | "manual" | "inteligencia" | "import";
      crm_confianca: "alta" | "media" | "validar";
      crm_note_kind: "note" | "call" | "email" | "whatsapp" | "meeting";
      crm_task_type: "follow_up" | "meeting" | "call" | "email" | "other";
      crm_decision_maker_area:
        | "rh_people"
        | "financeiro"
        | "operacoes_industrial"
        | "marketing"
        | "comercial_vendas"
        | "ti_tecnologia"
        | "juridico"
        | "compras_suprimentos"
        | "facilities"
        | "diretoria_executiva"
        | "socios_fundadores"
        | "outra";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      user_role: ["administrador", "gestor_comercial", "sdr"],
      crm_status: ["new", "contacted", "nurture", "qualified", "lost"],
      crm_source: ["prospeccao", "manual", "inteligencia", "import"],
      crm_confianca: ["alta", "media", "validar"],
      crm_note_kind: ["note", "call", "email", "whatsapp", "meeting"],
      crm_task_type: ["follow_up", "meeting", "call", "email", "other"],
      crm_decision_maker_area: [
        "rh_people",
        "financeiro",
        "operacoes_industrial",
        "marketing",
        "comercial_vendas",
        "ti_tecnologia",
        "juridico",
        "compras_suprimentos",
        "facilities",
        "diretoria_executiva",
        "socios_fundadores",
        "outra",
      ],
    },
  },
} as const;
