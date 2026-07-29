import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  Calendar,
  Check,
  Kanban,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  X,
  Users,
  Linkedin,
} from "lucide-react";
import {
  listCrmLeads,
  moveCrmLead,
  updateCrmLead,
  deleteCrmLead,
  assignCrmLead,
  listCrmNotes,
  addCrmNote,
  deleteCrmNote,
  listCrmTasks,
  addCrmTask,
  toggleCrmTask,
  deleteCrmTask,
  getCrmLeadProfile,
  listCrmDecisionMakers,
} from "@/lib/crm.functions";
import { listTeamSdrs } from "@/lib/rbac/admin.functions";
import type {
  CrmLead,
  CrmLeadNote,
  CrmLeadTask,
  CrmNoteKind,
  CrmStatus,
  CrmTaskType,
  CrmCompanyProfile,
  CrmDecisionMaker,
} from "@/lib/crm/types";
import {
  CRM_STATUS_META,
  CRM_NOTE_KIND_META,
  CRM_TASK_TYPE_META,
  CRM_DECISION_MAKER_AREA_META,
} from "@/lib/crm/types";
import { KanbanBoard } from "@/components/crm/KanbanBoard";
import { ProtectedRoute } from "@/components/rbac/ProtectedRoute";
import { useAuth } from "@/hooks/useAuth";
import { usePersistedRouteState } from "@/hooks/usePersistedRouteState";
import { MODULE_ROLES } from "@/lib/rbac/types";

export const Route = createFileRoute("/_authenticated/crm")({
  ssr: false,
  component: CrmRoute,
});

function CrmRoute() {
  return (
    <ProtectedRoute requiredRoles={MODULE_ROLES.crm}>
      <CrmPage />
    </ProtectedRoute>
  );
}

type SdrOption = { id: string; email: string; full_name: string | null };

function CrmPage() {
  const { role } = useAuth();
  const canAssign = role === "administrador" || role === "gestor_comercial";
  const canSeeProspeccao = role === "administrador" || role === "gestor_comercial";
  // Todos que veem o card podem apagar (SDR só os seus — server valida)
  const canDelete = true;

  const listFn = useServerFn(listCrmLeads);
  const moveFn = useServerFn(moveCrmLead);
  const updateFn = useServerFn(updateCrmLead);
  const deleteFn = useServerFn(deleteCrmLead);
  const assignFn = useServerFn(assignCrmLead);
  const sdrsFn = useServerFn(listTeamSdrs);
  const listNotesFn = useServerFn(listCrmNotes);
  const addNoteFn = useServerFn(addCrmNote);
  const deleteNoteFn = useServerFn(deleteCrmNote);
  const listTasksFn = useServerFn(listCrmTasks);
  const addTaskFn = useServerFn(addCrmTask);
  const getProfileFn = useServerFn(getCrmLeadProfile);
  const listDmFn = useServerFn(listCrmDecisionMakers);
  const toggleTaskFn = useServerFn(toggleCrmTask);
  const deleteTaskFn = useServerFn(deleteCrmTask);

  const [leads, setLeads] = useState<CrmLead[]>([]);
  const [sdrs, setSdrs] = useState<SdrOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Persiste só o id do lead aberto — sobrevive a sair/voltar da rota
  const [selectedId, setSelectedId] = usePersistedRouteState<string | null>(
    "crm.selectedId",
    null,
    1,
  );
  const selected = selectedId ? (leads.find((l) => l.id === selectedId) ?? null) : null;
  const setSelected = useCallback(
    (lead: CrmLead | null) => {
      setSelectedId(lead?.id ?? null);
    },
    [setSelectedId],
  );
  const [saving, setSaving] = useState(false);

  // Campos de contato editáveis
  const [contactDraft, setContactDraft] = useState({
    cnpj: "",
    phone: "",
    email: "",
    website: "",
    linkedin: "",
  });
  const [contactSaved, setContactSaved] = useState(false);

  // Observações (histórico)
  const [notes, setNotes] = useState<CrmLeadNote[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [noteKind, setNoteKind] = useState<CrmNoteKind>("call");
  const [noteSaving, setNoteSaving] = useState(false);

  // Tarefas
  const [tasks, setTasks] = useState<CrmLeadTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskType, setTaskType] = useState<CrmTaskType>("follow_up");
  const [taskDue, setTaskDue] = useState("");
  const [taskSaving, setTaskSaving] = useState(false);

  const [decisionMakers, setDecisionMakers] = useState<CrmDecisionMaker[]>([]);
  const [dmLoading, setDmLoading] = useState(false);
  const [companyProfile, setCompanyProfile] = useState<CrmCompanyProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listFn();
      setLeads(res.leads);
      // Se o lead que estava aberto foi removido, fecha o painel
      setSelectedId((id) => {
        if (!id) return null;
        return res.leads.some((l) => l.id === id) ? id : null;
      });
      if (canAssign) {
        try {
          const team = await sdrsFn();
          setSdrs(team.sdrs);
        } catch {
          setSdrs([]);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao carregar CRM");
    } finally {
      setLoading(false);
    }
  }, [listFn, sdrsFn, canAssign, setSelectedId]);

  // Carrega perfil + TDs persistidos no CRM (não depende de dossiê de Inteligência)
  useEffect(() => {
    if (!selected?.id) {
      setDecisionMakers([]);
      setCompanyProfile(null);
      return;
    }
    let cancelled = false;
    setDmLoading(true);
    setProfileLoading(true);
    void Promise.all([
      listDmFn({ data: { lead_id: selected.id } }),
      getProfileFn({ data: { lead_id: selected.id } }),
    ])
      .then(([dmRes, profRes]) => {
        if (cancelled) return;
        setDecisionMakers(dmRes.decisionMakers ?? []);
        setCompanyProfile(profRes.profile ?? null);
      })
      .catch(() => {
        if (cancelled) return;
        setDecisionMakers([]);
        setCompanyProfile(null);
      })
      .finally(() => {
        if (!cancelled) {
          setDmLoading(false);
          setProfileLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selected?.id, listDmFn, getProfileFn]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleMove(id: string, status: CrmStatus, position: number) {
    await moveFn({ data: { id, status, position } });
    setLeads((prev) => prev.map((l) => (l.id === id ? { ...l, status, position } : l)));
  }

  function applyLeadDrafts(lead: CrmLead) {
    setContactDraft({
      cnpj: lead.cnpj ?? "",
      phone: lead.phone ?? "",
      email: lead.email ?? "",
      website: lead.website ?? "",
      linkedin: lead.linkedin ?? "",
    });
    setContactSaved(false);
    setNoteDraft("");
    setNoteKind("call");
    setTaskTitle("");
    setTaskType("follow_up");
    setTaskDue("");
  }

  function sortTasksByDue<T extends { done: boolean; due_at: string | null }>(list: T[]): T[] {
    const now = Date.now();
    return [...list].sort((a, b) => {
      const aOver = a.due_at && !a.done && new Date(a.due_at).getTime() < now ? 0 : 1;
      const bOver = b.due_at && !b.done && new Date(b.due_at).getTime() < now ? 0 : 1;
      if (aOver !== bOver) return aOver - bOver;
      const ad = a.due_at ? new Date(a.due_at).getTime() : Infinity;
      const bd = b.due_at ? new Date(b.due_at).getTime() : Infinity;
      return ad - bd;
    });
  }

  async function loadLeadSideData(leadId: string) {
    setNotes([]);
    setTasks([]);
    setNotesLoading(true);
    setTasksLoading(true);
    try {
      const [n, t] = await Promise.all([
        listNotesFn({ data: { lead_id: leadId } }),
        listTasksFn({ data: { lead_id: leadId } }),
      ]);
      setNotes(n.notes ?? []);
      setTasks(sortTasksByDue(t.tasks ?? []));
    } catch {
      setNotes([]);
      setTasks([]);
    } finally {
      setNotesLoading(false);
      setTasksLoading(false);
    }
  }

  function openLead(lead: CrmLead) {
    setSelected(lead);
  }

  // Clique no card OU retorno à rota com selectedId persistido:
  // reidrata drafts + notes/tasks a partir do lead resolvido da lista.
  useEffect(() => {
    if (!selected) return;
    applyLeadDrafts(selected);
    void loadLeadSideData(selected.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  async function saveContact() {
    if (!selected) return;
    setSaving(true);
    setContactSaved(false);
    try {
      const patch = {
        id: selected.id,
        cnpj: contactDraft.cnpj.trim() || null,
        phone: contactDraft.phone.trim() || null,
        email: contactDraft.email.trim() || null,
        website: contactDraft.website.trim() || null,
        linkedin: contactDraft.linkedin.trim() || null,
      };
      await updateFn({ data: patch });
      const next = {
        ...selected,
        cnpj: patch.cnpj,
        phone: patch.phone,
        email: patch.email,
        website: patch.website,
        linkedin: patch.linkedin,
      };
      setSelected(next);
      setLeads((prev) => prev.map((l) => (l.id === next.id ? next : l)));
      setContactSaved(true);
      setTimeout(() => setContactSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao salvar contato");
    } finally {
      setSaving(false);
    }
  }

  async function onAssign(sdrId: string) {
    if (!selected) return;
    const value = sdrId || null;
    setSaving(true);
    try {
      await assignFn({ data: { id: selected.id, assigned_to: value } });
      setLeads((prev) =>
        prev.map((l) => (l.id === selected.id ? { ...l, assigned_to: value } : l)),
      );
      // selected é derivado de leads + selectedId — atualizar leads basta
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao atribuir");
    } finally {
      setSaving(false);
    }
  }

  async function removeLead() {
    if (!selected) return;
    if (
      !confirm(`Remover "${selected.organization}" do Kanban? Esta ação não pode ser desfeita.`)
    ) {
      return;
    }
    setSaving(true);
    try {
      await deleteFn({ data: { id: selected.id } });
      setLeads((prev) => prev.filter((l) => l.id !== selected.id));
      setSelected(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao remover");
    } finally {
      setSaving(false);
    }
  }

  async function submitNote() {
    if (!selected || !noteDraft.trim()) return;
    setNoteSaving(true);
    try {
      const res = await addNoteFn({
        data: {
          lead_id: selected.id,
          content: noteDraft.trim(),
          kind: noteKind,
        },
      });
      setNotes((prev) => [res.note, ...prev]);
      setNoteDraft("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao salvar observação");
    } finally {
      setNoteSaving(false);
    }
  }

  async function removeNote(id: string) {
    if (!confirm("Apagar esta observação?")) return;
    try {
      await deleteNoteFn({ data: { id } });
      setNotes((prev) => prev.filter((n) => n.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao apagar observação");
    }
  }

  async function submitTask() {
    if (!selected || !taskTitle.trim()) return;
    setTaskSaving(true);
    try {
      // datetime-local → ISO com timezone local
      let due_at: string | null = null;
      if (taskDue) {
        const d = new Date(taskDue);
        if (!Number.isNaN(d.getTime())) due_at = d.toISOString();
      }
      const res = await addTaskFn({
        data: {
          lead_id: selected.id,
          title: taskTitle.trim(),
          task_type: taskType,
          due_at,
        },
      });
      setTasks((prev) => sortTasksByDue([...prev, res.task]));
      setTaskTitle("");
      setTaskDue("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao criar tarefa");
    } finally {
      setTaskSaving(false);
    }
  }

  async function onToggleTask(task: CrmLeadTask) {
    try {
      const res = await toggleTaskFn({ data: { id: task.id, done: !task.done } });
      setTasks((prev) => sortTasksByDue(prev.map((t) => (t.id === task.id ? res.task : t))));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao atualizar tarefa");
    }
  }

  async function onDeleteTask(id: string) {
    if (!confirm("Apagar esta tarefa?")) return;
    try {
      await deleteTaskFn({ data: { id } });
      setTasks((prev) => prev.filter((t) => t.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao apagar tarefa");
    }
  }

  function sdrLabel(id: string | null): string {
    if (!id) return "Sem atribuição";
    const s = sdrs.find((x) => x.id === id);
    return s ? s.full_name || s.email : id.slice(0, 8);
  }

  function formatDt(iso: string | null): string {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  }

  return (
    <main className="min-h-full">
      <div className="border-b border-[var(--cy-card-border)] bg-[var(--cy-card)]">
        <div className="mx-auto flex max-w-[1600px] items-center gap-4 px-4 py-3">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-[var(--cy-muted)] hover:bg-[var(--cy-surface-hover)] hover:text-[var(--cy-content-ink)] transition"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Início
          </Link>
          <div className="flex items-center gap-2">
            <Kanban className="h-4 w-4 text-[#0F4C5C]" />
            <h1 className="text-base font-semibold tracking-tight">CRM</h1>
            <span className="rounded-full bg-[var(--cy-surface-hover)] px-2 py-0.5 text-[11px] text-[var(--cy-muted)]">
              {leads.length} lead{leads.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {canSeeProspeccao && (
              <Link
                to="/prospeccao"
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-[var(--cy-muted)] hover:bg-[var(--cy-surface-hover)] hover:text-[var(--cy-content-ink)] transition"
              >
                Prospecção
              </Link>
            )}
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--cy-card-border)] bg-[var(--cy-input-bg)] px-3 py-1.5 text-xs font-medium text-[var(--cy-muted)] hover:bg-[var(--cy-surface-hover)] transition disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1600px] px-4 py-5">
        {loading && leads.length === 0 ? (
          <div className="flex items-center justify-center py-24 text-sm text-[var(--cy-muted)]">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando pipeline…
          </div>
        ) : error && leads.length === 0 ? (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
            {error}
          </div>
        ) : leads.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
            <Kanban className="h-10 w-10 text-[#2a6570]" />
            <p className="text-sm text-[var(--cy-muted)]">
              {role === "sdr" ? "Nenhum lead atribuído a você ainda." : "Nenhum lead no CRM ainda."}
            </p>
            {canSeeProspeccao && (
              <Link
                to="/prospeccao"
                className="mt-2 rounded-xl bg-[#0F4C5C] px-4 py-2 text-sm font-semibold text-white hover:bg-[#2E7A85] transition"
              >
                Ir para Prospecção
              </Link>
            )}
          </div>
        ) : (
          <KanbanBoard leads={leads} onMove={handleMove} onCardClick={openLead} />
        )}
        {error && leads.length > 0 && (
          <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
            {error}
          </div>
        )}
      </div>

      {selected && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/50"
          onClick={() => setSelected(null)}
        >
          <aside
            className="flex h-full w-full max-w-md flex-col border-l border-[var(--cy-card-border)] bg-[var(--cy-card)] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-[var(--cy-card-border)] px-4 py-3">
              <h2 className="flex-1 truncate text-base font-semibold">{selected.organization}</h2>
              {canDelete && (
                <button
                  type="button"
                  onClick={() => void removeLead()}
                  disabled={saving}
                  className="rounded-lg border border-red-500/30 bg-red-500/10 p-1.5 text-red-400 hover:bg-red-500/20 disabled:opacity-50"
                  title="Apagar do Kanban"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="rounded-lg p-1.5 text-[var(--cy-muted)] hover:bg-[var(--cy-surface-hover)] hover:text-[var(--cy-content-ink)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto p-4 text-sm">
              <div>
                <span
                  className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold"
                  style={{
                    background: `${CRM_STATUS_META[selected.status].color}22`,
                    color: CRM_STATUS_META[selected.status].color,
                  }}
                >
                  {CRM_STATUS_META[selected.status].label}
                </span>
              </div>

              <ReadOnlyField label="Segmento" value={selected.segment} />
              <ReadOnlyField label="UF" value={selected.uf} />
              <ReadOnlyField label="Fit" value={selected.fit} />
              <ReadOnlyField label="Confiança" value={selected.confianca} />
              <ReadOnlyField label="Fonte" value={selected.source} />

              {/* Contato editável (CNPJ, telefone, e-mail, site, LinkedIn) */}
              <div className="rounded-xl border border-[var(--cy-card-border)] bg-[var(--cy-input-bg)] p-3 space-y-3">
                <p className="text-xs font-bold text-[var(--cy-content-ink)]">Dados de contato</p>
                {(
                  [
                    ["cnpj", "CNPJ"],
                    ["phone", "Telefone"],
                    ["email", "E-mail"],
                    ["website", "Site"],
                    ["linkedin", "LinkedIn"],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key}>
                    <label className="mb-1 block text-[11px] font-semibold text-[var(--cy-muted)]">
                      {label}
                    </label>
                    <input
                      type="text"
                      value={contactDraft[key]}
                      onChange={(e) => {
                        setContactDraft((d) => ({ ...d, [key]: e.target.value }));
                        setContactSaved(false);
                      }}
                      placeholder={label}
                      className="w-full rounded-lg border border-[var(--cy-card-border)] bg-[var(--cy-card)] px-2.5 py-1.5 text-sm text-[var(--cy-content-ink)] outline-none focus:border-[#0F4C5C]"
                    />
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => void saveContact()}
                  disabled={saving}
                  className="w-full rounded-lg bg-[#0F4C5C] py-2 text-xs font-semibold text-white hover:bg-[#2E7A85] disabled:opacity-50"
                >
                  {saving ? "Salvando…" : contactSaved ? "✓ Contato salvo" : "Salvar contato"}
                </button>
              </div>

              {/* Perfil completo da empresa (enrichment) */}
              <div className="rounded-xl border border-[var(--cy-card-border)] bg-[var(--cy-input-bg)] p-3 space-y-2">
                <p className="text-xs font-bold text-[var(--cy-content-ink)]">Dados da empresa</p>
                {profileLoading ? (
                  <p className="text-[11px] text-[var(--cy-muted)]">
                    <Loader2 className="inline h-3 w-3 animate-spin" /> Carregando perfil…
                  </p>
                ) : companyProfile ? (
                  <div className="grid grid-cols-1 gap-1.5 text-[11px]">
                    {[
                      ["Razão Social", companyProfile.razao_social],
                      ["Nome Fantasia", companyProfile.nome_fantasia],
                      ["CNPJ", companyProfile.cnpj],
                      ["Telefone Fixo", companyProfile.telefone_fixo],
                      ["WhatsApp", companyProfile.whatsapp],
                      ["Telefone Comercial", companyProfile.telefone_comercial],
                      ["SAC", companyProfile.sac],
                      ["E-mail", companyProfile.email],
                      ["Site", companyProfile.site],
                      ["LinkedIn", companyProfile.linkedin],
                      ["Cidade", companyProfile.cidade],
                      ["Estado", companyProfile.estado],
                      ["Segmento", companyProfile.segmento],
                      ["Porte", companyProfile.porte],
                      ["CNAE", companyProfile.cnae],
                      ["CNAE (desc.)", companyProfile.cnae_descricao],
                      ["Fonte", companyProfile.fonte_enriquecimento],
                    ].map(([label, value]) =>
                      value ? (
                        <div key={String(label)} className="flex gap-2">
                          <span className="shrink-0 font-semibold text-[var(--cy-muted)] w-28">
                            {label}
                          </span>
                          <span className="text-[var(--cy-content-ink)] break-all">{value}</span>
                        </div>
                      ) : null,
                    )}
                  </div>
                ) : (
                  <p className="text-[11px] text-[var(--cy-muted)] italic">
                    Perfil completo ainda não disponível para este lead.
                  </p>
                )}
              </div>

              {/* Tomadores de Decisão (persistidos no CRM) */}
              <div className="rounded-xl border border-[var(--cy-card-border)] bg-[var(--cy-input-bg)] p-3 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Users className="h-3.5 w-3.5 text-[#0F4C5C]" />
                    <p className="text-xs font-bold text-[var(--cy-content-ink)]">
                      Tomadores de decisão
                    </p>
                  </div>
                  {selected && (
                    <a
                      href={`/inteligencia/relatorio?pending=${encodeURIComponent(selected.organization)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-md border border-[#0F4C5C]/30 bg-[#0F4C5C]/10 px-2 py-1 text-[10px] font-semibold text-[#0F4C5C] hover:bg-[#0F4C5C]/20"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Abrir Inteligência
                    </a>
                  )}
                </div>
                {dmLoading ? (
                  <p className="text-[11px] text-[var(--cy-muted)]">
                    <Loader2 className="inline h-3 w-3 animate-spin" /> Buscando TDs…
                  </p>
                ) : decisionMakers.length === 0 ? (
                  <p className="text-[11px] text-[var(--cy-muted)] italic">
                    Nenhum tomador de decisão encontrado ainda. Os TDs são buscados na prospecção ao
                    gerar leads; reimporte o lead após uma nova busca se necessário.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {decisionMakers.map((dm) => (
                      <li
                        key={dm.id}
                        className="flex items-start justify-between gap-2 rounded-lg border border-[var(--cy-card-border)] bg-[var(--cy-card)] px-2.5 py-2"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-[var(--cy-content-ink)] truncate">
                            {dm.name}
                          </p>
                          <p className="text-[10px] text-[var(--cy-muted)] truncate">
                            {dm.title || "—"}
                            {dm.area
                              ? ` · ${CRM_DECISION_MAKER_AREA_META[dm.area]?.label ?? dm.area}`
                              : ""}
                          </p>
                          <div className="mt-0.5 flex flex-wrap gap-2 text-[10px] text-[var(--cy-muted)]">
                            <span>Prioridade {dm.priority}</span>
                            <span>Score {dm.score}</span>
                            {dm.probabilidade_decisor != null && (
                              <span>Prob. {Math.round(dm.probabilidade_decisor * 100)}%</span>
                            )}
                          </div>
                          {dm.evidence && (
                            <p className="mt-0.5 text-[10px] text-[var(--cy-muted)] italic line-clamp-2">
                              {dm.evidence}
                            </p>
                          )}
                        </div>
                        {dm.linkedin_url ? (
                          <a
                            href={dm.linkedin_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="shrink-0 inline-flex items-center gap-1 rounded-md border border-[#0A66C2]/30 bg-[#0A66C2]/10 px-2 py-1 text-[10px] font-semibold text-[#0A66C2] hover:bg-[#0A66C2]/20"
                            title="Abrir LinkedIn em nova guia"
                          >
                            <Linkedin className="h-3 w-3" />
                            LinkedIn
                          </a>
                        ) : (
                          <span className="text-[10px] text-[var(--cy-muted)] italic shrink-0">
                            sem link
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {canAssign ? (
                <div>
                  <label className="mb-1.5 block text-xs font-semibold text-[var(--cy-muted)]">
                    Atribuir SDR
                  </label>
                  <select
                    value={selected.assigned_to ?? ""}
                    onChange={(e) => void onAssign(e.target.value)}
                    disabled={saving}
                    className="w-full rounded-xl border border-[var(--cy-card-border)] bg-[var(--cy-input-bg)] px-3 py-2 text-sm text-[var(--cy-content-ink)] outline-none focus:border-[#0F4C5C] disabled:opacity-50"
                  >
                    <option value="">— Sem atribuição —</option>
                    {sdrs.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.full_name || s.email}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <ReadOnlyField label="SDR" value={sdrLabel(selected.assigned_to)} />
              )}

              {/* Tarefas */}
              <div className="rounded-xl border border-[var(--cy-card-border)] bg-[var(--cy-input-bg)] p-3 space-y-3">
                <div className="flex items-center gap-2">
                  <Calendar className="h-3.5 w-3.5 text-[#0F4C5C]" />
                  <p className="text-xs font-bold text-[var(--cy-content-ink)]">Tarefas</p>
                </div>

                <div className="space-y-2">
                  <input
                    type="text"
                    value={taskTitle}
                    onChange={(e) => setTaskTitle(e.target.value)}
                    placeholder="Ex: Follow-up com o decisor"
                    className="w-full rounded-lg border border-[var(--cy-card-border)] bg-[var(--cy-card)] px-2.5 py-1.5 text-sm text-[var(--cy-content-ink)] outline-none focus:border-[#0F4C5C]"
                  />
                  <div className="flex gap-2">
                    <select
                      value={taskType}
                      onChange={(e) => setTaskType(e.target.value as CrmTaskType)}
                      className="flex-1 rounded-lg border border-[var(--cy-card-border)] bg-[var(--cy-card)] px-2 py-1.5 text-xs text-[var(--cy-content-ink)] outline-none"
                    >
                      {(Object.keys(CRM_TASK_TYPE_META) as CrmTaskType[]).map((k) => (
                        <option key={k} value={k}>
                          {CRM_TASK_TYPE_META[k].label}
                        </option>
                      ))}
                    </select>
                    <input
                      type="datetime-local"
                      min={new Date(Date.now() - 60_000).toISOString().slice(0, 16)}
                      value={taskDue}
                      onChange={(e) => setTaskDue(e.target.value)}
                      className="flex-1 rounded-lg border border-[var(--cy-card-border)] bg-[var(--cy-card)] px-2 py-1.5 text-xs text-[var(--cy-content-ink)] outline-none"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => void submitTask()}
                    disabled={taskSaving || !taskTitle.trim()}
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-[#0F4C5C]/40 bg-[#0F4C5C]/15 py-2 text-xs font-semibold text-[var(--cy-muted)] hover:bg-[#0F4C5C]/25 disabled:opacity-50"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {taskSaving ? "Salvando…" : "Agendar tarefa"}
                  </button>
                </div>

                {tasksLoading ? (
                  <p className="text-[11px] text-[var(--cy-muted)]">
                    <Loader2 className="inline h-3 w-3 animate-spin" /> Carregando…
                  </p>
                ) : tasks.length === 0 ? (
                  <p className="text-[11px] text-[var(--cy-muted)]">Nenhuma tarefa ainda.</p>
                ) : (
                  <ul className="space-y-2">
                    {tasks.map((t) => {
                      const isOverdue =
                        !t.done && !!t.due_at && new Date(t.due_at).getTime() < Date.now();
                      return (
                        <li
                          key={t.id}
                          className={`flex items-start gap-2 rounded-lg border p-2 ${
                            isOverdue
                              ? "border-red-400/50 bg-red-500/5"
                              : "border-[var(--cy-card-border)] bg-[var(--cy-card)]"
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => void onToggleTask(t)}
                            className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                              t.done
                                ? "border-emerald-500 bg-emerald-500 text-white"
                                : "border-[var(--cy-card-border)]"
                            }`}
                          >
                            {t.done && <Check className="h-3 w-3" />}
                          </button>
                          <div className="min-w-0 flex-1">
                            <p
                              className={`text-xs font-medium ${
                                t.done
                                  ? "text-[var(--cy-muted)] line-through"
                                  : "text-[var(--cy-content-ink)]"
                              }`}
                            >
                              {t.title}
                            </p>
                            <p
                              className={`text-[10px] ${
                                isOverdue ? "font-semibold text-red-500" : "text-[var(--cy-muted)]"
                              }`}
                            >
                              {CRM_TASK_TYPE_META[t.task_type].label}
                              {t.due_at
                                ? ` · ${isOverdue ? "Vencida " : ""}${formatDt(t.due_at)}`
                                : ""}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => void onDeleteTask(t.id)}
                            className="p-1 text-[var(--cy-muted)] hover:text-red-400"
                            title="Apagar tarefa"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {/* Observações — histórico permanente */}
              <div className="rounded-xl border border-[var(--cy-card-border)] bg-[var(--cy-input-bg)] p-3 space-y-3">
                <p className="text-xs font-bold text-[var(--cy-content-ink)]">
                  Observações de contato
                </p>
                <p className="text-[10px] text-[var(--cy-muted)] leading-snug">
                  Registre como foi a ligação ou e-mail. Cada anotação fica salva com data e autor —
                  volte dias depois e veja o histórico completo.
                </p>

                <div className="flex gap-2">
                  <select
                    value={noteKind}
                    onChange={(e) => setNoteKind(e.target.value as CrmNoteKind)}
                    className="rounded-lg border border-[var(--cy-card-border)] bg-[var(--cy-card)] px-2 py-1.5 text-xs text-[var(--cy-content-ink)] outline-none"
                  >
                    {(Object.keys(CRM_NOTE_KIND_META) as CrmNoteKind[]).map((k) => (
                      <option key={k} value={k}>
                        {CRM_NOTE_KIND_META[k].label}
                      </option>
                    ))}
                  </select>
                </div>
                <textarea
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  rows={3}
                  placeholder="Ex: Falei com a Lead X, marquei retorno para a data Y."
                  className="w-full rounded-lg border border-[var(--cy-card-border)] bg-[var(--cy-card)] px-2.5 py-2 text-sm text-[var(--cy-content-ink)] outline-none focus:border-[#0F4C5C] resize-none"
                />
                <button
                  type="button"
                  onClick={() => void submitNote()}
                  disabled={noteSaving || !noteDraft.trim()}
                  className="w-full rounded-lg bg-[#0F4C5C] py-2 text-xs font-semibold text-white hover:bg-[#2E7A85] disabled:opacity-50"
                >
                  {noteSaving ? "Salvando…" : "Registrar observação"}
                </button>

                {notesLoading ? (
                  <p className="text-[11px] text-[var(--cy-muted)]">
                    <Loader2 className="inline h-3 w-3 animate-spin" /> Carregando histórico…
                  </p>
                ) : notes.length === 0 ? (
                  <p className="text-[11px] text-[var(--cy-muted)]">Nenhuma observação ainda.</p>
                ) : (
                  <ul className="space-y-2 max-h-64 overflow-y-auto">
                    {notes.map((n) => (
                      <li
                        key={n.id}
                        className="rounded-lg border border-[var(--cy-card-border)] bg-[var(--cy-card)] p-2.5"
                      >
                        <div className="mb-1 flex items-center gap-2">
                          <span className="rounded bg-[var(--cy-surface-hover)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--cy-muted)]">
                            {CRM_NOTE_KIND_META[n.kind]?.label ?? n.kind}
                          </span>
                          <span className="text-[10px] text-[var(--cy-muted)]">
                            {n.author_name ?? "—"} · {formatDt(n.created_at)}
                          </span>
                          <button
                            type="button"
                            onClick={() => void removeNote(n.id)}
                            className="ml-auto p-0.5 text-[var(--cy-muted)] hover:text-red-400"
                            title="Apagar"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                        <p className="whitespace-pre-wrap text-xs text-[var(--cy-muted)] leading-relaxed">
                          {n.content}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="flex gap-2 border-t border-[var(--cy-card-border)] p-4">
              {canDelete && (
                <button
                  type="button"
                  onClick={() => void removeLead()}
                  disabled={saving}
                  className="flex-1 rounded-xl border border-red-500/30 bg-red-500/10 py-2.5 text-sm font-semibold text-red-400 hover:bg-red-500/20 disabled:opacity-50"
                >
                  Apagar do Kanban
                </button>
              )}
            </div>
          </aside>
        </div>
      )}
    </main>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs font-semibold text-[var(--cy-muted)]">{label}</p>
      <p className="mt-0.5 text-[var(--cy-muted)]">{value}</p>
    </div>
  );
}
