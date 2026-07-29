/**
 * Valor JSON serializável. Necessário porque o payload de server function do
 * TanStack Start só aceita tipos provadamente serializáveis — `unknown` quebra
 * a inferência do handler (raw_enrichment vem do enrichment e vira JSONB).
 */
export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

/** Status do pipeline Kanban — alinhados ao Frappe CRM Lead demo */
export const CRM_STATUSES = ["new", "contacted", "nurture", "qualified", "lost"] as const;

export type CrmStatus = (typeof CRM_STATUSES)[number];

export const CRM_STATUS_META: Record<
  CrmStatus,
  { label: string; color: string; columnBg: string }
> = {
  new: {
    label: "Novo",
    color: "#0F4C5C",
    columnBg: "rgba(15, 76, 92, 0.08)",
  },
  contacted: {
    label: "Contactado",
    color: "#3b82f6",
    columnBg: "rgba(59, 130, 246, 0.08)",
  },
  nurture: {
    label: "Nutrição",
    color: "#f5a623",
    columnBg: "rgba(245, 166, 35, 0.08)",
  },
  qualified: {
    label: "Qualificado",
    color: "#27a644",
    columnBg: "rgba(39, 166, 68, 0.08)",
  },
  lost: {
    label: "Perdido",
    color: "#e01e2c",
    columnBg: "rgba(224, 30, 44, 0.08)",
  },
};

export type CrmSource = "prospeccao" | "manual" | "inteligencia" | "import";

export type CrmLead = {
  id: string;
  user_id: string;
  organization: string;
  organization_norm: string;
  website: string | null;
  email: string | null;
  phone: string | null;
  linkedin: string | null;
  cnpj: string | null;
  status: CrmStatus;
  source: CrmSource;
  industry: string | null;
  segment: string | null;
  uf: string | null;
  municipio: string | null;
  fit: string | null;
  confianca: "alta" | "media" | "validar" | null;
  position: number;
  notes: string | null;
  converted: boolean;
  lost_reason: string | null;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
};

/** Observação de contato (ligação / e-mail / nota) — histórico append-only */
export type CrmNoteKind = "note" | "call" | "email" | "whatsapp" | "meeting";

export type CrmLeadNote = {
  id: string;
  lead_id: string;
  user_id: string;
  author_name: string | null;
  kind: CrmNoteKind;
  content: string;
  created_at: string;
};

export const CRM_NOTE_KIND_META: Record<CrmNoteKind, { label: string }> = {
  note: { label: "Nota" },
  call: { label: "Ligação" },
  email: { label: "E-mail" },
  whatsapp: { label: "WhatsApp" },
  meeting: { label: "Reunião" },
};

/** Tarefa agendada no lead */
export type CrmTaskType = "follow_up" | "meeting" | "call" | "email" | "other";

export type CrmLeadTask = {
  id: string;
  lead_id: string;
  user_id: string;
  title: string;
  task_type: CrmTaskType;
  due_at: string | null;
  done: boolean;
  done_at: string | null;
  created_at: string;
  updated_at: string;
};

export const CRM_TASK_TYPE_META: Record<CrmTaskType, { label: string }> = {
  follow_up: { label: "Follow-up" },
  meeting: { label: "Reunião" },
  call: { label: "Ligação" },
  email: { label: "E-mail" },
  other: { label: "Outro" },
};

/** Payload para criar lead a partir da prospecção */
export type CrmLeadInput = {
  organization: string;
  website?: string | null;
  email?: string | null;
  phone?: string | null;
  linkedin?: string | null;
  cnpj?: string | null;
  status?: CrmStatus;
  source?: CrmSource;
  industry?: string | null;
  segment?: string | null;
  uf?: string | null;
  municipio?: string | null;
  fit?: string | null;
  confianca?: "alta" | "media" | "validar" | null;
  notes?: string | null;
  /** SDR destino ao importar lote da prospecção */
  assigned_to?: string | null;
};

export type CrmImportResult = {
  organization: string;
  status: "created" | "updated" | "skipped" | "failed";
  id?: string;
  error?: string;
};

// =============================================================================
// Perfil completo da empresa (enrichment) — persistido separado do card
// principal do Kanban, em crm_lead_company_profiles.
// =============================================================================

/** Tipo de contato público classificado durante o enrichment. */
export type CrmContactKind =
  | "telefone_fixo"
  | "whatsapp"
  | "telefone_comercial"
  | "sac"
  | "email"
  | "formulario"
  | "central_comercial"
  | "site"
  | "linkedin";

export const CRM_CONTACT_KIND_META: Record<CrmContactKind, { label: string }> = {
  telefone_fixo: { label: "Telefone Fixo" },
  whatsapp: { label: "WhatsApp" },
  telefone_comercial: { label: "Telefone Comercial" },
  sac: { label: "SAC" },
  email: { label: "E-mail" },
  formulario: { label: "Formulário" },
  central_comercial: { label: "Central Comercial" },
  site: { label: "Site" },
  linkedin: { label: "LinkedIn" },
};

/** Um contato classificado com a evidência/origem que motivou a classificação. */
export type CrmContactOrigin = {
  tipo: CrmContactKind;
  valor: string;
  /** de onde veio: url da página, "busca_publica", etc. */
  origem: string;
  /** trecho curto de contexto que justificou a classificação (ex.: texto perto do link) */
  evidencia?: string | null;
};

export type CrmCompanyProfile = {
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
  contatos_origem: CrmContactOrigin[];
  raw_enrichment: JsonObject | null;
  created_at: string;
  updated_at: string;
};

/** Payload para criar/atualizar o perfil de empresa a partir do enrichment. */
export type CrmCompanyProfileInput = {
  lead_id: string;
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
  contatos_origem?: CrmContactOrigin[];
  raw_enrichment?: JsonObject | null;
};

// =============================================================================
// Tomadores de decisão (TDs) — persistidos separado do card principal,
// em crm_lead_decision_makers. Disponíveis no Kanban sem depender de
// relatório de Inteligência Comercial.
// =============================================================================

/** Área compradora — usada na cascata Área ideal → ... → CEO. */
export type CrmDecisionMakerArea =
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

export const CRM_DECISION_MAKER_AREA_META: Record<CrmDecisionMakerArea, { label: string }> = {
  rh_people: { label: "RH / People" },
  financeiro: { label: "Financeiro" },
  operacoes_industrial: { label: "Operações / Industrial" },
  marketing: { label: "Marketing" },
  comercial_vendas: { label: "Comercial / Vendas" },
  ti_tecnologia: { label: "TI / Tecnologia" },
  juridico: { label: "Jurídico" },
  compras_suprimentos: { label: "Compras / Suprimentos" },
  facilities: { label: "Facilities" },
  diretoria_executiva: { label: "Diretoria Executiva" },
  socios_fundadores: { label: "Sócios / Fundadores" },
  outra: { label: "Outra" },
};

export type CrmDecisionMaker = {
  id: string;
  lead_id: string;
  user_id: string;
  name: string;
  title: string | null;
  area: CrmDecisionMakerArea | null;
  /** menor número = maior prioridade (ordenar crescente) */
  priority: number;
  /** 0-100, maior = melhor (ordenar decrescente) */
  score: number;
  probabilidade_decisor: number | null;
  linkedin_url: string | null;
  employment_verified: boolean;
  source: string | null;
  evidence: string | null;
  /** hash do contexto comercial (produto + diferencial + direcionamento) que gerou este TD */
  commercial_context_hash: string | null;
  created_at: string;
  updated_at: string;
};

export type CrmDecisionMakerInput = {
  lead_id: string;
  name: string;
  title?: string | null;
  area?: CrmDecisionMakerArea | null;
  priority: number;
  score: number;
  probabilidade_decisor?: number | null;
  linkedin_url?: string | null;
  employment_verified?: boolean;
  source?: string | null;
  evidence?: string | null;
  commercial_context_hash?: string | null;
};

export function normalizeOrgName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}
