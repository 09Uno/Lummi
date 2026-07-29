/**
 * CRM Kanban nativo — server functions (Supabase).
 * Visibilidade por papel: SDR só vê leads atribuídos a ele.
 * Inclui: import com assigned_to, histórico de observações, tarefas.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  CRM_STATUSES,
  normalizeOrgName,
  type CrmContactOrigin,
  type CrmDecisionMaker,
  type CrmDecisionMakerArea,
  type CrmImportResult,
  type CrmLead,
  type CrmLeadNote,
  type CrmLeadTask,
  type CrmStatus,
  type CrmCompanyProfile,
  type JsonObject,
} from "@/lib/crm/types";
import type { UserRole } from "@/lib/rbac/types";
import type { Database } from "@/integrations/supabase/types";

import type { SupabaseClient } from "@supabase/supabase-js";

type CrmLeadInsert = Database["public"]["Tables"]["crm_leads"]["Insert"];
type CrmLeadUpdate = Database["public"]["Tables"]["crm_leads"]["Update"];

/** Cliente Supabase já autenticado, entregue por requireSupabaseAuth no context. */
type AuthedSupabase = SupabaseClient<Database>;

const StatusSchema = z.enum(CRM_STATUSES);

const ContactOriginSchema = z.object({
  tipo: z.enum([
    "telefone_fixo",
    "whatsapp",
    "telefone_comercial",
    "sac",
    "email",
    "formulario",
    "central_comercial",
    "site",
    "linkedin",
  ]),
  valor: z.string(),
  origem: z.string(),
  evidencia: z.string().nullable().optional(),
});

const DecisionMakerInputSchema = z.object({
  name: z.string().min(1),
  title: z.string().nullable().optional(),
  area: z.string().nullable().optional(),
  priority: z.number().int().min(1).max(99).optional().default(99),
  score: z.number().min(0).max(100).optional().default(0),
  probabilidade_decisor: z.number().min(0).max(1).nullable().optional(),
  linkedin_url: z.string().nullable().optional(),
  employment_verified: z.boolean().optional().default(false),
  source: z.string().nullable().optional(),
  evidence: z.string().nullable().optional(),
  commercial_context_hash: z.string().nullable().optional(),
});

const LeadInputSchema = z.object({
  organization: z.string().min(1).max(300),
  website: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  linkedin: z.string().nullable().optional(),
  cnpj: z.string().nullable().optional(),
  status: StatusSchema.optional(),
  source: z.enum(["prospeccao", "manual", "inteligencia", "import"]).optional(),
  industry: z.string().nullable().optional(),
  segment: z.string().nullable().optional(),
  uf: z.string().nullable().optional(),
  municipio: z.string().nullable().optional(),
  fit: z.string().nullable().optional(),
  confianca: z.enum(["alta", "media", "validar"]).nullable().optional(),
  notes: z.string().nullable().optional(),
  assigned_to: z.string().uuid().nullable().optional(),
  // perfil completo (opcional)
  razao_social: z.string().nullable().optional(),
  nome_fantasia: z.string().nullable().optional(),
  telefone_fixo: z.string().nullable().optional(),
  whatsapp: z.string().nullable().optional(),
  telefone_comercial: z.string().nullable().optional(),
  sac: z.string().nullable().optional(),
  porte: z.string().nullable().optional(),
  cnae: z.string().nullable().optional(),
  cnae_descricao: z.string().nullable().optional(),
  fonte_enriquecimento: z.string().nullable().optional(),
  contatos_origem: z.array(ContactOriginSchema).optional(),
  decisionMakers: z.array(DecisionMakerInputSchema).optional(),
  commercial_context_hash: z.string().nullable().optional(),
});

const ImportSchema = z.object({
  leads: z.array(LeadInputSchema).min(1).max(50),
  /** Atribui o lote inteiro a um SDR (admin/gestor). */
  assigned_to: z.string().uuid().nullable().optional(),
});

const UpdateStatusSchema = z.object({
  id: z.string().uuid(),
  status: StatusSchema,
  position: z.number().int().min(0).optional(),
});

const UpdateLeadSchema = z.object({
  id: z.string().uuid(),
  notes: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  linkedin: z.string().nullable().optional(),
  cnpj: z.string().nullable().optional(),
  lost_reason: z.string().nullable().optional(),
  status: StatusSchema.optional(),
  assigned_to: z.string().uuid().nullable().optional(),
});

const AssignSchema = z.object({
  id: z.string().uuid(),
  assigned_to: z.string().uuid().nullable(),
});

const DeleteSchema = z.object({
  id: z.string().uuid(),
});

const ReorderSchema = z.object({
  id: z.string().uuid(),
  status: StatusSchema,
  position: z.number().int().min(0),
});

const LeadIdSchema = z.object({
  lead_id: z.string().uuid(),
});

const AddNoteSchema = z.object({
  lead_id: z.string().uuid(),
  content: z.string().min(1).max(8000),
  kind: z.enum(["note", "call", "email", "whatsapp", "meeting"]).optional(),
});

const AddTaskSchema = z.object({
  lead_id: z.string().uuid(),
  title: z.string().min(1).max(500),
  task_type: z.enum(["follow_up", "meeting", "call", "email", "other"]).optional(),
  /** ISO 8601 (ex.: 2026-07-24T15:00:00.000Z) ou null */
  due_at: z.string().nullable().optional(),
});

const TaskIdSchema = z.object({
  id: z.string().uuid(),
});

const ToggleTaskSchema = z.object({
  id: z.string().uuid(),
  done: z.boolean(),
});

function mapAreaToEnum(area: string | null | undefined): CrmDecisionMakerArea | null {
  if (!area) return null;
  const t = area
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (/\b(rh|people|recursos humanos|talent|beneficio)\b/.test(t)) return "rh_people";
  if (/\b(financ|cfo|controller|contab)\b/.test(t)) return "financeiro";
  if (/\b(oper|industr|produ[cç]|coo)\b/.test(t)) return "operacoes_industrial";
  if (/\b(market|growth|cmo|comunica)\b/.test(t)) return "marketing";
  if (/\b(comercial|vendas|sales)\b/.test(t)) return "comercial_vendas";
  if (/\b(ti\b|tecnolog|cto|software|produto digital)\b/.test(t)) return "ti_tecnologia";
  if (/\b(jurid|legal|advog)\b/.test(t)) return "juridico";
  if (/\b(compra|supriment|procurement)\b/.test(t)) return "compras_suprimentos";
  if (/\b(facilit|limpeza|seguran[cç]a predial)\b/.test(t)) return "facilities";
  if (/\b(ceo|diretor(a)? geral|presid|diretoria)\b/.test(t)) return "diretoria_executiva";
  if (/\b(socio|s[oó]cio|fundador|founder)\b/.test(t)) return "socios_fundadores";
  return "outra";
}

function mapProfileRow(row: Record<string, unknown>): CrmCompanyProfile {
  return {
    id: String(row.id),
    lead_id: String(row.lead_id),
    user_id: String(row.user_id),
    razao_social: (row.razao_social as string) ?? null,
    nome_fantasia: (row.nome_fantasia as string) ?? null,
    cnpj: (row.cnpj as string) ?? null,
    telefone_fixo: (row.telefone_fixo as string) ?? null,
    whatsapp: (row.whatsapp as string) ?? null,
    telefone_comercial: (row.telefone_comercial as string) ?? null,
    sac: (row.sac as string) ?? null,
    email: (row.email as string) ?? null,
    site: (row.site as string) ?? null,
    linkedin: (row.linkedin as string) ?? null,
    cidade: (row.cidade as string) ?? null,
    estado: (row.estado as string) ?? null,
    segmento: (row.segmento as string) ?? null,
    porte: (row.porte as string) ?? null,
    cnae: (row.cnae as string) ?? null,
    cnae_descricao: (row.cnae_descricao as string) ?? null,
    fonte_enriquecimento: (row.fonte_enriquecimento as string) ?? null,
    contatos_origem: Array.isArray(row.contatos_origem)
      ? (row.contatos_origem as CrmContactOrigin[])
      : [],
    raw_enrichment: (row.raw_enrichment as JsonObject) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function mapDecisionMakerRow(row: Record<string, unknown>): CrmDecisionMaker {
  return {
    id: String(row.id),
    lead_id: String(row.lead_id),
    user_id: String(row.user_id),
    name: String(row.name),
    title: (row.title as string) ?? null,
    area: (row.area as CrmDecisionMakerArea) ?? null,
    priority: Number(row.priority ?? 99),
    score: Number(row.score ?? 0),
    probabilidade_decisor:
      row.probabilidade_decisor != null ? Number(row.probabilidade_decisor) : null,
    linkedin_url: (row.linkedin_url as string) ?? null,
    employment_verified: Boolean(row.employment_verified),
    source: (row.source as string) ?? null,
    evidence: (row.evidence as string) ?? null,
    commercial_context_hash: (row.commercial_context_hash as string) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

async function upsertCompanyProfileAndDms(
  supabase: AuthedSupabase,
  userId: string,
  leadId: string,
  lead: z.infer<typeof LeadInputSchema>,
): Promise<void> {
  const profilePayload = {
    lead_id: leadId,
    user_id: userId,
    razao_social: lead.razao_social ?? null,
    nome_fantasia: lead.nome_fantasia ?? null,
    cnpj: lead.cnpj ?? null,
    telefone_fixo: lead.telefone_fixo ?? null,
    whatsapp: lead.whatsapp ?? null,
    telefone_comercial: lead.telefone_comercial ?? null,
    sac: lead.sac ?? null,
    email: lead.email ?? null,
    site: lead.website ?? null,
    linkedin: lead.linkedin ?? null,
    cidade: lead.municipio ?? null,
    estado: lead.uf ?? null,
    segmento: lead.segment ?? null,
    porte: lead.porte ?? null,
    cnae: lead.cnae ?? null,
    cnae_descricao: lead.cnae_descricao ?? null,
    fonte_enriquecimento: lead.fonte_enriquecimento ?? null,
    contatos_origem: lead.contatos_origem ?? [],
  };

  const { error: profErr } = await supabase
    .from("crm_lead_company_profiles")
    .upsert(profilePayload, { onConflict: "lead_id" });
  if (profErr) {
    console.warn("[crm] profile upsert warn:", profErr.message);
  }

  const dms = lead.decisionMakers ?? [];
  if (dms.length > 0) {
    // Substitui TDs do mesmo contexto comercial (ou todos se sem hash)
    const ctxHash = lead.commercial_context_hash ?? null;
    if (ctxHash) {
      await supabase
        .from("crm_lead_decision_makers")
        .delete()
        .eq("lead_id", leadId)
        .eq("commercial_context_hash", ctxHash);
    } else {
      await supabase.from("crm_lead_decision_makers").delete().eq("lead_id", leadId);
    }
    const rows = dms.map((dm) => ({
      lead_id: leadId,
      user_id: userId,
      name: dm.name,
      title: dm.title ?? null,
      // mapAreaToEnum só devolve null quando dm.area vem vazio — o fallback antigo
      // reinjetava a string crua e furava o CHECK da coluna.
      area: mapAreaToEnum(dm.area),
      priority: dm.priority ?? 99,
      score: dm.score ?? 0,
      probabilidade_decisor: dm.probabilidade_decisor ?? null,
      linkedin_url: dm.linkedin_url ?? null,
      employment_verified: dm.employment_verified ?? false,
      source: dm.source ?? null,
      evidence: dm.evidence ?? null,
      commercial_context_hash: dm.commercial_context_hash ?? ctxHash,
    }));
    const { error: dmErr } = await supabase.from("crm_lead_decision_makers").insert(rows);
    if (dmErr) console.warn("[crm] decision makers insert warn:", dmErr.message);
  }
}

function mapRow(row: Record<string, unknown>): CrmLead {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    organization: String(row.organization),
    organization_norm: String(row.organization_norm),
    website: (row.website as string) ?? null,
    email: (row.email as string) ?? null,
    phone: (row.phone as string) ?? null,
    linkedin: (row.linkedin as string) ?? null,
    cnpj: (row.cnpj as string) ?? null,
    status: row.status as CrmStatus,
    source: (row.source as CrmLead["source"]) ?? "prospeccao",
    industry: (row.industry as string) ?? null,
    segment: (row.segment as string) ?? null,
    uf: (row.uf as string) ?? null,
    municipio: (row.municipio as string) ?? null,
    fit: (row.fit as string) ?? null,
    confianca: (row.confianca as CrmLead["confianca"]) ?? null,
    position: Number(row.position ?? 0),
    notes: (row.notes as string) ?? null,
    converted: Boolean(row.converted),
    lost_reason: (row.lost_reason as string) ?? null,
    assigned_to: (row.assigned_to as string) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function mapNote(row: Record<string, unknown>): CrmLeadNote {
  return {
    id: String(row.id),
    lead_id: String(row.lead_id),
    user_id: String(row.user_id),
    author_name: (row.author_name as string) ?? null,
    kind: (row.kind as CrmLeadNote["kind"]) ?? "note",
    content: String(row.content),
    created_at: String(row.created_at),
  };
}

function mapTask(row: Record<string, unknown>): CrmLeadTask {
  return {
    id: String(row.id),
    lead_id: String(row.lead_id),
    user_id: String(row.user_id),
    title: String(row.title),
    task_type: (row.task_type as CrmLeadTask["task_type"]) ?? "follow_up",
    due_at: (row.due_at as string) ?? null,
    done: Boolean(row.done),
    done_at: (row.done_at as string) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

async function getRole(supabase: AuthedSupabase, userId: string): Promise<UserRole> {
  const { data, error } = await supabase
    .from("users")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.role) throw new Error("Perfil não encontrado.");
  return data.role as UserRole;
}

async function getAuthorName(supabase: AuthedSupabase, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("users")
    .select("full_name, email")
    .eq("id", userId)
    .maybeSingle();
  if (!data) return null;
  return (data.full_name as string) || (data.email as string) || null;
}

async function assertLeadAccess(
  supabase: AuthedSupabase,
  userId: string,
  role: UserRole,
  leadId: string,
): Promise<void> {
  let q = supabase.from("crm_leads").select("id").eq("id", leadId);
  if (role === "sdr") q = q.eq("assigned_to", userId);
  const { data, error } = await q.maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Lead não encontrado ou sem permissão.");
}

/** Lista leads do pipeline conforme papel. */
export const listCrmLeads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const role = await getRole(supabase, userId);

    let query = supabase.from("crm_leads").select("*");

    if (role === "sdr") {
      query = query.eq("assigned_to", userId);
    } else if (role === "gestor_comercial") {
      const { data: sdrs } = await supabase
        .from("users")
        .select("id")
        .eq("role", "sdr")
        .eq("manager_id", userId);
      const sdrIds = (sdrs ?? []).map((s: { id: string }) => s.id);
      if (sdrIds.length > 0) {
        query = query.or(
          `user_id.eq.${userId},assigned_to.eq.${userId},assigned_to.in.(${sdrIds.join(",")}),user_id.in.(${sdrIds.join(",")})`,
        );
      } else {
        query = query.or(`user_id.eq.${userId},assigned_to.eq.${userId}`);
      }
    }
    // administrador: vê todos (RLS + sem filtro extra)

    const { data, error } = await query.order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { leads: (data ?? []).map((r) => mapRow(r as Record<string, unknown>)) };
  });

/**
 * Importa lote da prospecção.
 * assigned_to no root (ou em cada lead) permite enviar 5 para SDR Y e 5 para SDR X.
 */
export const importLeadsToCrm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ImportSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const role = await getRole(supabase, userId);

    if (role === "sdr") {
      throw new Error("SDR não importa leads — peça ao gestor para atribuir.");
    }

    const batchAssigned = data.assigned_to ?? null;

    if (batchAssigned && role === "gestor_comercial") {
      const { data: sdr } = await supabase
        .from("users")
        .select("id, role, manager_id")
        .eq("id", batchAssigned)
        .maybeSingle();
      if (!sdr || sdr.role !== "sdr" || sdr.manager_id !== userId) {
        throw new Error("SDR inválido ou fora da sua equipe.");
      }
    }

    const results: CrmImportResult[] = [];
    let created = 0;
    let updated = 0;
    let failed = 0;

    for (const lead of data.leads) {
      const organization_norm = normalizeOrgName(lead.organization);
      if (!organization_norm) {
        results.push({ organization: lead.organization, status: "failed", error: "Nome inválido" });
        failed++;
        continue;
      }

      const assignedTo = lead.assigned_to ?? batchAssigned ?? null;

      const payload: CrmLeadInsert = {
        user_id: userId,
        organization: lead.organization.trim(),
        organization_norm,
        website: lead.website ?? null,
        email: lead.email ?? null,
        phone: lead.phone ?? null,
        linkedin: lead.linkedin ?? null,
        cnpj: lead.cnpj ?? null,
        status: lead.status ?? "new",
        source: lead.source ?? "prospeccao",
        industry: lead.industry ?? null,
        segment: lead.segment ?? null,
        uf: lead.uf ?? null,
        municipio: lead.municipio ?? null,
        fit: lead.fit ?? null,
        confianca: lead.confianca ?? null,
        notes: lead.notes ?? null,
        assigned_to: assignedTo,
      };

      const { data: existing } = await supabase
        .from("crm_leads")
        .select("id")
        .eq("user_id", userId)
        .eq("organization_norm", organization_norm)
        .maybeSingle();

      if (existing?.id) {
        const updatePayload: CrmLeadUpdate = {
          website: payload.website,
          email: payload.email,
          phone: payload.phone,
          linkedin: payload.linkedin,
          cnpj: payload.cnpj,
          industry: payload.industry,
          segment: payload.segment,
          uf: payload.uf,
          municipio: payload.municipio,
          fit: payload.fit,
          confianca: payload.confianca,
        };
        // Só sobrescreve assigned_to se o lote trouxe um SDR
        if (assignedTo) updatePayload.assigned_to = assignedTo;

        const { error } = await supabase
          .from("crm_leads")
          .update(updatePayload)
          .eq("id", existing.id)
          .eq("user_id", userId);
        if (error) {
          results.push({ organization: lead.organization, status: "failed", error: error.message });
          failed++;
        } else {
          results.push({ organization: lead.organization, status: "updated", id: existing.id });
          updated++;
          try {
            await upsertCompanyProfileAndDms(supabase, userId, existing.id as string, lead);
          } catch (e) {
            console.warn("[crm] profile/dm after update:", e);
          }
        }
      } else {
        const { count } = await supabase
          .from("crm_leads")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("status", payload.status ?? "new");

        const { data: inserted, error } = await supabase
          .from("crm_leads")
          .insert({ ...payload, position: count ?? 0 })
          .select("id")
          .single();

        if (error) {
          results.push({ organization: lead.organization, status: "failed", error: error.message });
          failed++;
        } else {
          results.push({ organization: lead.organization, status: "created", id: inserted.id });
          created++;
          try {
            await upsertCompanyProfileAndDms(supabase, userId, inserted.id as string, lead);
          } catch (e) {
            console.warn("[crm] profile/dm after create:", e);
          }
        }
      }
    }

    return { results, summary: { created, updated, failed } };
  });

/** Atribui (ou remove) SDR de um lead. */
export const assignCrmLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => AssignSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const role = await getRole(supabase, userId);
    if (role === "sdr") throw new Error("SDR não pode reatribuir leads.");

    if (data.assigned_to && role === "gestor_comercial") {
      const { data: sdr } = await supabase
        .from("users")
        .select("id, role, manager_id")
        .eq("id", data.assigned_to)
        .maybeSingle();
      if (!sdr || sdr.role !== "sdr" || sdr.manager_id !== userId) {
        throw new Error("SDR inválido ou fora da sua equipe.");
      }
    }

    const { error } = await supabase
      .from("crm_leads")
      .update({ assigned_to: data.assigned_to })
      .eq("id", data.id);

    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Move card (status + position). */
export const moveCrmLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ReorderSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const role = await getRole(supabase, userId);

    let q = supabase
      .from("crm_leads")
      .update({ status: data.status, position: data.position })
      .eq("id", data.id);

    if (role === "sdr") q = q.eq("assigned_to", userId);

    const { error } = await q;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Atualiza status simples. */
export const updateCrmLeadStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpdateStatusSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const role = await getRole(supabase, userId);
    const patch: CrmLeadUpdate = { status: data.status };
    if (typeof data.position === "number") patch.position = data.position;

    let q = supabase.from("crm_leads").update(patch).eq("id", data.id);
    if (role === "sdr") q = q.eq("assigned_to", userId);

    const { error } = await q;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Atualiza campos do lead (contato, CNPJ, notas legadas etc.). */
export const updateCrmLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => UpdateLeadSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const role = await getRole(supabase, userId);
    const { id, ...rest } = data;
    const patch: CrmLeadUpdate = {};
    for (const [k, v] of Object.entries(rest)) {
      if (v !== undefined) (patch as Record<string, unknown>)[k] = v;
    }
    if (Object.keys(patch).length === 0) return { ok: true };

    if (role === "sdr" && "assigned_to" in patch) {
      delete patch.assigned_to;
    }

    let q = supabase.from("crm_leads").update(patch).eq("id", id);
    if (role === "sdr") q = q.eq("assigned_to", userId);

    const { error } = await q;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Remove lead do CRM (apaga card do Kanban).
 * Admin/gestor: qualquer. SDR: só os atribuídos a ele (para limpar pipeline).
 */
export const deleteCrmLead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => DeleteSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const role = await getRole(supabase, userId);

    let q = supabase.from("crm_leads").delete().eq("id", data.id);
    if (role === "sdr") {
      q = q.eq("assigned_to", userId);
    }

    const { error, count } = await q;
    if (error) throw new Error(error.message);
    return { ok: true, count };
  });

// ─── Observações (histórico de ligação / e-mail) ───────────────────────────

export const listCrmNotes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => LeadIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const role = await getRole(supabase, userId);
    await assertLeadAccess(supabase, userId, role, data.lead_id);

    const { data: rows, error } = await supabase
      .from("crm_lead_notes")
      .select("*")
      .eq("lead_id", data.lead_id)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    return { notes: (rows ?? []).map((r) => mapNote(r as Record<string, unknown>)) };
  });

/** Adiciona observação permanente (não sobrescreve as anteriores). */
export const addCrmNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => AddNoteSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const role = await getRole(supabase, userId);
    await assertLeadAccess(supabase, userId, role, data.lead_id);

    const author_name = await getAuthorName(supabase, userId);

    const { data: row, error } = await supabase
      .from("crm_lead_notes")
      .insert({
        lead_id: data.lead_id,
        user_id: userId,
        author_name,
        kind: data.kind ?? "note",
        content: data.content.trim(),
      })
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    return { note: mapNote(row as Record<string, unknown>) };
  });

export const deleteCrmNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const role = await getRole(supabase, userId);

    // autor ou admin/gestor
    let q = supabase.from("crm_lead_notes").delete().eq("id", data.id);
    if (role === "sdr") q = q.eq("user_id", userId);

    const { error } = await q;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ─── Tarefas (follow-up / reunião) ──────────────────────────────────────────

export const listCrmTasks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => LeadIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const role = await getRole(supabase, userId);
    await assertLeadAccess(supabase, userId, role, data.lead_id);

    const { data: rows, error } = await supabase
      .from("crm_lead_tasks")
      .select("*")
      .eq("lead_id", data.lead_id)
      .order("done", { ascending: true })
      .order("due_at", { ascending: true, nullsFirst: false });

    if (error) throw new Error(error.message);
    return { tasks: (rows ?? []).map((r) => mapTask(r as Record<string, unknown>)) };
  });

export const addCrmTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => AddTaskSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const role = await getRole(supabase, userId);
    await assertLeadAccess(supabase, userId, role, data.lead_id);

    const { data: row, error } = await supabase
      .from("crm_lead_tasks")
      .insert({
        lead_id: data.lead_id,
        user_id: userId,
        title: data.title.trim(),
        task_type: data.task_type ?? "follow_up",
        due_at: data.due_at ?? null,
      })
      .select("*")
      .single();

    if (error) throw new Error(error.message);
    return { task: mapTask(row as Record<string, unknown>) };
  });

export const toggleCrmTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ToggleTaskSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const role = await getRole(supabase, userId);

    const patch = {
      done: data.done,
      done_at: data.done ? new Date().toISOString() : null,
    };

    let q = supabase.from("crm_lead_tasks").update(patch).eq("id", data.id);
    // SDR só altera tarefas de leads atribuídos — RLS cobre; filtro extra por dono da task
    if (role === "sdr") q = q.eq("user_id", userId);

    const { data: row, error } = await q.select("*").maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Tarefa não encontrada ou sem permissão.");
    return { task: mapTask(row as Record<string, unknown>) };
  });

export const deleteCrmTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => TaskIdSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const role = await getRole(supabase, userId);

    let q = supabase.from("crm_lead_tasks").delete().eq("id", data.id);
    if (role === "sdr") q = q.eq("user_id", userId);

    const { error } = await q;
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ─── Tarefas globais (página /tarefas) ───────────────────────────────────────

const ListAllTasksSchema = z.object({
  status: z.enum(["all", "pending", "done"]).optional(),
  assigned_user_id: z.string().uuid().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

export const listAllCrmTasks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ListAllTasksSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const role = await getRole(supabase, userId);

    let q = supabase
      .from("crm_lead_tasks")
      .select("*, crm_leads(organization, assigned_to)")
      .order("done", { ascending: true })
      .order("due_at", { ascending: true, nullsFirst: false })
      .limit(300);

    if (role === "sdr") {
      q = q.eq("user_id", userId);
    } else if (role === "gestor_comercial") {
      // gestor: próprias + SDRs subordinados
      const { data: sdrs } = await supabase
        .from("users")
        .select("id")
        .eq("manager_id", userId)
        .eq("role", "sdr");
      const sdrIds = (sdrs ?? []).map((s) => s.id as string);
      const ids = [userId, ...sdrIds];
      q = q.in("user_id", ids);
    }
    // admin: vê todas (sem filtro extra)

    if (data.status === "pending") q = q.eq("done", false);
    if (data.status === "done") q = q.eq("done", true);
    if (data.assigned_user_id) q = q.eq("user_id", data.assigned_user_id);
    if (data.from) q = q.gte("due_at", data.from);
    if (data.to) q = q.lte("due_at", data.to);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const tasks = (rows ?? []).map((r) => {
      const base = mapTask(r as Record<string, unknown>);
      const lead = (r as { crm_leads?: { organization?: string; assigned_to?: string } }).crm_leads;
      return {
        ...base,
        organization: lead?.organization ?? null,
        lead_assigned_to: lead?.assigned_to ?? null,
      };
    });
    return { tasks };
  });

export const countPendingTasks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const role = await getRole(supabase, userId);

    let q = supabase.from("crm_lead_tasks").select("id, due_at").eq("done", false);

    if (role === "sdr") {
      q = q.eq("user_id", userId);
    } else if (role === "gestor_comercial") {
      const { data: sdrs } = await supabase
        .from("users")
        .select("id")
        .eq("manager_id", userId)
        .eq("role", "sdr");
      const sdrIds = (sdrs ?? []).map((s) => s.id as string);
      q = q.in("user_id", [userId, ...sdrIds]);
    }

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    const now = new Date().toISOString();
    const overdue = rows.filter((r) => r.due_at && r.due_at < now).length;
    return { count: rows.length, overdue };
  });

/** Perfil completo da empresa (enrichment) para um lead. */
export const getCrmLeadProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ lead_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const role = await getRole(supabase, userId);
    await assertLeadAccess(supabase, userId, role, data.lead_id);

    const { data: row, error } = await supabase
      .from("crm_lead_company_profiles")
      .select("*")
      .eq("lead_id", data.lead_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { profile: row ? mapProfileRow(row as Record<string, unknown>) : null };
  });

/** Tomadores de decisão persistidos no CRM (não depende de dossiê). */
export const listCrmDecisionMakers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ lead_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const role = await getRole(supabase, userId);
    await assertLeadAccess(supabase, userId, role, data.lead_id);

    const { data: rows, error } = await supabase
      .from("crm_lead_decision_makers")
      .select("*")
      .eq("lead_id", data.lead_id)
      .order("priority", { ascending: true })
      .order("score", { ascending: false });
    if (error) throw new Error(error.message);
    return {
      decisionMakers: (rows ?? []).map((r) => mapDecisionMakerRow(r as Record<string, unknown>)),
    };
  });
