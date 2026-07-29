import { importLeadsToCrm } from "@/lib/crm.functions";
import { listTeamSdrs } from "@/lib/rbac/admin.functions";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePersistedRouteState } from "@/hooks/usePersistedRouteState";
import {
  Loader2,
  Sparkles,
  MapPin,
  Check,
  Globe,
  Linkedin,
  LogOut,
  FileSpreadsheet,
  ThumbsUp,
  ThumbsDown,
  Brain,
  ArrowLeft,
  CheckSquare,
  Square,
  Kanban,
  X,
  Users,
} from "lucide-react";
import { generateIntelligenceReport } from "@/lib/intelligence-report.functions";
import { LeadImportModal } from "@/components/leads/LeadImportModal";
import { generateLeads, submitLeadFeedback } from "@/lib/leads.functions";
import type { EnrichedLead } from "@/lib/leads.functions";
import { commercialContextHash } from "@/lib/decision-makers";
import { ICP_SECTOR_CATALOG } from "@/lib/icp-sector-catalog";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { ProtectedRoute } from "@/components/rbac/ProtectedRoute";
import { MODULE_ROLES } from "@/lib/rbac/types";
import { LeadRow } from "@/components/ui/LeadRow";

export const Route = createFileRoute("/_authenticated/prospeccao")({
  component: () => (
    <ProtectedRoute requiredRoles={MODULE_ROLES.prospeccao}>
      <Index />
    </ProtectedRoute>
  ),
});

/** Macro → micro labels derivados do catálogo tipado ICP (CNAE + metadados). */
const SETORES: Record<string, string[]> = Object.fromEntries(
  ICP_SECTOR_CATALOG.map((macro) => [
    macro.label,
    [...macro.microSectors]
      .sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99))
      .map((m) => m.label),
  ]),
);

/** Lookup rápido label de microsetor → metadados (CNAE, descrição). */
const MICRO_META = Object.fromEntries(
  ICP_SECTOR_CATALOG.flatMap((macro) =>
    macro.microSectors.map((m) => [
      m.label,
      {
        id: m.id,
        macroId: macro.id,
        macroLabel: macro.label,
        cnaeGroups: m.cnaeGroups,
        cnaeToValidar: Boolean(m.cnaeToValidar),
        description: m.description,
        priority: m.priority ?? 99,
      },
    ]),
  ),
);

const PORTES = [
  "Até 50 funcionários",
  "51-200 funcionários",
  "201-500 funcionários",
  "501-1000 funcionários",
  "1000+ funcionários",
];

const UFS = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
  "Brasil Todo",
];

const QUANTIDADES = [10, 25, 50];

function Chip({
  active,
  onClick,
  children,
  disabled,
  showCheck = true,
}: {
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  showCheck?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs transition-all border h-8",
        "disabled:opacity-40 disabled:cursor-not-allowed",
        active
          ? "bg-gradient-to-b from-[#2E7A85] to-[#0F4C5C] text-white border-[#7FB0B4] ring-2 ring-[#0F4C5C]/60 ring-offset-2 ring-offset-[var(--cy-card)] shadow-[0_4px_14px_-2px_rgba(15, 76, 92, 0.65),inset_0_1px_0_rgba(255,255,255,0.25)] font-semibold scale-[1.03]"
          : "bg-[var(--cy-surface-hover)] text-[var(--cy-muted)] border-[var(--cy-card-border)] font-medium hover:border-[#0F4C5C]/60 hover:text-white",
      )}
    >
      {active && showCheck && <Check className="w-3.5 h-3.5" strokeWidth={3} />}
      <span>{children}</span>
    </button>
  );
}

function avatarColor(name: string) {
  const colors = [
    "from-pink-500 to-rose-500",
    "from-orange-400 to-red-500",
    "from-violet-500 to-fuchsia-500",
    "from-sky-500 to-indigo-500",
    "from-emerald-500 to-teal-500",
    "from-amber-400 to-orange-500",
  ];
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return colors[h % colors.length];
}

function csvEscape(v: string) {
  const s = String(v ?? "");
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function confiancaLabel(c: EnrichedLead["confianca"]) {
  if (c === "alta") return "Alta confiança";
  if (c === "media") return "Confiança média";
  return "A validar";
}

function downloadCsv(leads: EnrichedLead[], oQueVende: string) {
  const header = [
    "Empresa",
    "UF",
    "Segmento",
    "Site",
    "LinkedIn",
    "CNPJ",
    "Razão Social",
    "CNAE",
    "Descrição CNAE",
    "Porte Oficial",
    "Situação",
    "Município",
    "Telefone",
    "Email",
    "Score",
    "Fit",
    `Justificativa (${oQueVende || "Sua Solução"})`,
    "Resumo Executivo",
    "Produtos",
    "Serviços",
    "Data de geração",
  ];
  const now = new Date().toISOString();
  const rows = leads.map((l) => {
    const score = l.confianca === "alta" ? 88 : l.confianca === "media" ? 65 : 40;
    return [
      l.empresa,
      l.uf,
      l.segmento,
      l.website ?? "Não encontrado",
      l.linkedin ?? "Não encontrado",
      l.cnpj ?? "Não encontrado",
      l.razao_social ?? "Não encontrado",
      l.cnae ?? "Não encontrado",
      l.cnae_descricao ?? "Não encontrado",
      l.porte_oficial ?? "Não encontrado",
      l.situacao ?? "Não encontrado",
      l.municipio ?? "Não encontrado",
      (l.telefones ?? []).join(" | ") || "Não encontrado",
      (l.emails ?? []).join(" | ") || "Não encontrado",
      String(score),
      confiancaLabel(l.confianca),
      l.fit ?? "Não encontrado",
      l.resumo_site || "Não encontrado",
      (l.produtos ?? []).join(" | ") || "Não encontrado",
      (l.servicos ?? []).join(" | ") || "Não encontrado",
      now,
    ]
      .map(csvEscape)
      .join(",");
  });
  const csv = "\uFEFF" + [header.map(csvEscape).join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

type PersistedFilters = {
  macros: string[];
  micros: string[];
  porte: string;
  estados: string[];
  quantidade: number;
  oQueVende: string;
  diferencial: string;
  infoExtra: string;
};

const FILTERS_KEY = "leadforge:prospeccao:filters:v4";
const DEFAULT_FILTERS: PersistedFilters = {
  macros: [],
  micros: [],
  porte: "",
  estados: [],
  quantidade: 10,
  oQueVende: "",
  diferencial: "",
  infoExtra: "",
};

function loadFilters(): PersistedFilters {
  if (typeof window === "undefined") return DEFAULT_FILTERS;
  try {
    const raw =
      window.localStorage.getItem(FILTERS_KEY) ??
      window.localStorage.getItem("leadforge:prospeccao:filters:v3") ??
      window.localStorage.getItem("leadforge:prospeccao:filters:v2");
    if (!raw) return DEFAULT_FILTERS;
    const parsed = JSON.parse(raw) as Partial<PersistedFilters> & {
      macro?: string;
      micro?: string;
    };
    const macros = Array.isArray(parsed.macros)
      ? parsed.macros
      : parsed.macro
        ? [parsed.macro]
        : [];
    const micros = Array.isArray(parsed.micros)
      ? parsed.micros
      : parsed.micro
        ? [parsed.micro]
        : [];
    return { ...DEFAULT_FILTERS, ...parsed, macros, micros };
  } catch {
    return DEFAULT_FILTERS;
  }
}

function saveFilters(f: PersistedFilters) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(FILTERS_KEY, JSON.stringify(f));
  } catch {
    /* ignore quota errors */
  }
}

function Index() {
  const navigate = useNavigate();
  const run = useServerFn(generateLeads);
  const feedbackFn = useServerFn(submitLeadFeedback);
  const intelligenceFn = useServerFn(generateIntelligenceReport);
  const crmFn = useServerFn(importLeadsToCrm);
  const sdrsFn = useServerFn(listTeamSdrs);
  const [intelligencePending, setIntelligencePending] = useState<Record<string, boolean>>({});
  const persisted = useMemo(() => loadFilters(), []);
  const [macros, setMacros] = useState<string[]>(persisted.macros);
  const [micros, setMicros] = useState<string[]>(persisted.micros);
  const [porte, setPorte] = useState(persisted.porte);
  const [estados, setEstados] = useState<string[]>(persisted.estados);
  const [quantidade, setQuantidade] = useState<number>(persisted.quantidade);
  const [ufOpen, setUfOpen] = useState(false);
  const [oQueVende, setOQueVende] = useState(persisted.oQueVende);
  const [diferencial, setDiferencial] = useState(persisted.diferencial);
  const [infoExtra, setInfoExtra] = useState(persisted.infoExtra);
  const [macroLimitWarning, setMacroLimitWarning] = useState(false);
  const [microLimitWarning, setMicroLimitWarning] = useState(false);
  const [loading, setLoading] = useState(false);
  // Estado de sessão (resultados, seleção, feedback, export) — sobrevive a
  // navegar para CRM/Tarefas e voltar, sem refetch nem tela vazia.
  type ProspeccaoSession = {
    leads: EnrichedLead[] | null;
    cached: boolean;
    randomized: boolean;
    exploracaoModo: "validados" | "novo" | "agressivo";
    feedbackMap: Record<string, "good" | "bad">;
    selected: string[];
    crmResult: {
      summary: { created: number; updated: number; failed: number };
      results: { organization: string; status: string; error?: string }[];
    } | null;
  };
  const SESSION_DEFAULT: ProspeccaoSession = {
    leads: null,
    cached: false,
    randomized: false,
    exploracaoModo: "validados",
    feedbackMap: {},
    selected: [],
    crmResult: null,
  };
  const [session, setSession] = usePersistedRouteState<ProspeccaoSession>(
    "prospeccao.session",
    SESSION_DEFAULT,
    3,
  );
  const leads = session.leads;
  const cached = session.cached;
  const randomized = session.randomized;
  const exploracaoModo = session.exploracaoModo;
  const feedbackMap = session.feedbackMap;
  const selected = useMemo(() => new Set(session.selected), [session.selected]);
  const crmResult = session.crmResult;

  const setLeads = useCallback(
    (v: EnrichedLead[] | null | ((prev: EnrichedLead[] | null) => EnrichedLead[] | null)) => {
      setSession((s) => ({
        ...s,
        leads: typeof v === "function" ? v(s.leads) : v,
      }));
    },
    [setSession],
  );
  const setCached = useCallback(
    (v: boolean) => setSession((s) => ({ ...s, cached: v })),
    [setSession],
  );
  const setRandomized = useCallback(
    (v: boolean) => setSession((s) => ({ ...s, randomized: v })),
    [setSession],
  );
  const setExploracaoModo = useCallback(
    (v: "validados" | "novo" | "agressivo") => setSession((s) => ({ ...s, exploracaoModo: v })),
    [setSession],
  );
  const setFeedbackMap = useCallback(
    (
      v:
        | Record<string, "good" | "bad">
        | ((prev: Record<string, "good" | "bad">) => Record<string, "good" | "bad">),
    ) => {
      setSession((s) => ({
        ...s,
        feedbackMap: typeof v === "function" ? v(s.feedbackMap) : v,
      }));
    },
    [setSession],
  );
  const setSelected = useCallback(
    (v: Set<string> | ((prev: Set<string>) => Set<string>)) => {
      setSession((s) => {
        const prev = new Set(s.selected);
        const next = typeof v === "function" ? v(prev) : v;
        return { ...s, selected: Array.from(next) };
      });
    },
    [setSession],
  );
  const setCrmResult = useCallback(
    (
      v:
        | ProspeccaoSession["crmResult"]
        | ((prev: ProspeccaoSession["crmResult"]) => ProspeccaoSession["crmResult"]),
    ) => {
      setSession((s) => ({
        ...s,
        crmResult: typeof v === "function" ? v(s.crmResult) : v,
      }));
    },
    [setSession],
  );

  const [skipCache, setSkipCache] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedbackPending, setFeedbackPending] = useState<Record<string, boolean>>({});
  const [crmLoading, setCrmLoading] = useState(false);
  /** Modal: enviar lote selecionado a um SDR específico */
  const [crmModalOpen, setCrmModalOpen] = useState(false);
  const [sdrs, setSdrs] = useState<Array<{ id: string; email: string; full_name: string | null }>>(
    [],
  );
  const [sdrsLoading, setSdrsLoading] = useState(false);
  const [assignSdrId, setAssignSdrId] = useState<string>("");

  useEffect(() => {
    saveFilters({ macros, micros, porte, estados, quantidade, oQueVende, diferencial, infoExtra });
  }, [macros, micros, porte, estados, quantidade, oQueVende, diferencial, infoExtra]);

  const microOptions = useMemo(() => {
    const set = new Set<string>();
    for (const m of macros) for (const s of SETORES[m] ?? []) set.add(s);
    return [...set];
  }, [macros]);

  // Remove micros que não pertencem mais a nenhum macro selecionado
  useEffect(() => {
    setMicros((prev) => prev.filter((m) => microOptions.includes(m)));
  }, [microOptions]);

  function toggleMacro(m: string) {
    setMacros((prev) => {
      if (prev.includes(m)) return prev.filter((x) => x !== m);
      if (prev.length >= 3) {
        setMacroLimitWarning(true);
        window.setTimeout(() => setMacroLimitWarning(false), 2500);
        return prev;
      }
      return [...prev, m];
    });
  }

  function toggleMicro(m: string) {
    setMicros((prev) => {
      if (prev.includes(m)) return prev.filter((x) => x !== m);
      if (prev.length >= 5) {
        setMicroLimitWarning(true);
        window.setTimeout(() => setMicroLimitWarning(false), 2500);
        return prev;
      }
      return [...prev, m];
    });
  }

  const canSubmit =
    macros.length > 0 &&
    micros.length > 0 &&
    porte &&
    estados.length > 0 &&
    oQueVende.trim() &&
    !loading;

  function toggleEstado(uf: string) {
    setEstados((prev) => {
      if (uf === "Brasil Todo") return prev.includes(uf) ? [] : ["Brasil Todo"];
      const filtered = prev.filter((e) => e !== "Brasil Todo");
      if (filtered.includes(uf)) return filtered.filter((e) => e !== uf);
      if (filtered.length >= 3) return filtered;
      return [...filtered, uf];
    });
  }

  async function onSubmit() {
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    setLeads(null);
    setFeedbackMap({});
    setSelected(new Set());
    try {
      const res = await run({
        data: {
          macroSetor: macros.join(" / "),
          microSetor: micros.join(" / "),
          porte,
          estados,
          quantidade,
          oQueVende: oQueVende.trim(),
          diferencial: diferencial.trim(),
          infoExtra: infoExtra.trim(),
          exploracaoModo,
          skipCache,
        },
      });
      if (!res.ok) {
        console.error("[generateLeads] falhou", res);
        setError(
          `Falha na geração (${res.stage ?? "desconhecido"}): ${res.error ?? "erro sem detalhe"}`,
        );
        setLeads([]);
      } else {
        setLeads(res.leads);
        setCached(res.cached);
        setRandomized(Boolean(res.randomized));
      }
    } catch (e) {
      console.error("[generateLeads] exceção inesperada", e);
      setError(e instanceof Error ? e.message : "Erro inesperado");
    } finally {
      setLoading(false);
    }
  }

  async function onFeedback(empresa: string, rating: "good" | "bad") {
    setFeedbackPending((m) => ({ ...m, [empresa]: true }));
    try {
      await feedbackFn({ data: { empresa, rating } });
      setFeedbackMap((m) => ({ ...m, [empresa]: rating }));
    } catch {
      // silencioso
    } finally {
      setFeedbackPending((m) => ({ ...m, [empresa]: false }));
    }
  }

  /** Abre modal para escolher SDR (ou enviar sem atribuição). */
  async function openCrmModal() {
    if (!leads || leads.length === 0) return;
    const scope = selected.size > 0 ? leads.filter((l) => selected.has(l.empresa)) : leads;
    if (scope.length === 0) return;
    setCrmModalOpen(true);
    setAssignSdrId("");
    setSdrsLoading(true);
    try {
      const team = await sdrsFn();
      setSdrs(team.sdrs);
    } catch {
      setSdrs([]);
    } finally {
      setSdrsLoading(false);
    }
  }

  /**
   * Envia o lote selecionado (ou todos) ao CRM.
   * assigned_to: UUID do SDR, ou null = só entra no Kanban sem dono.
   * Fluxo típico: selecionar 5 → enviar ao SDR Y → limpar seleção →
   * selecionar outros 5 → enviar ao SDR X.
   */
  async function onSendToCrm(assignedTo: string | null) {
    if (!leads || leads.length === 0) return;
    const scope = selected.size > 0 ? leads.filter((l) => selected.has(l.empresa)) : leads;
    if (scope.length === 0) return;
    setCrmLoading(true);
    setCrmResult(null);
    setCrmModalOpen(false);
    try {
      const res = await crmFn({
        data: {
          assigned_to: assignedTo,
          leads: scope.map((l) => ({
            organization: l.empresa,
            website: l.website,
            linkedin: l.linkedin,
            cnpj: l.cnpj,
            email: l.emails?.[0] ?? null,
            phone:
              l.telefone_comercial ?? l.telefone_fixo ?? l.whatsapp ?? l.telefones?.[0] ?? null,
            segment: l.segmento,
            uf: l.uf,
            municipio: l.municipio,
            fit: l.fit,
            confianca: l.confianca,
            source: "prospeccao" as const,
            status: "new" as const,
            razao_social: l.razao_social,
            nome_fantasia: l.nome_fantasia,
            telefone_fixo: l.telefone_fixo,
            whatsapp: l.whatsapp,
            telefone_comercial: l.telefone_comercial,
            sac: l.sac,
            porte: l.porte_oficial,
            cnae: l.cnae,
            cnae_descricao: l.cnae_descricao,
            fonte_enriquecimento: l.fonte_enriquecimento,
            contatos_origem: (l.contatos ?? []).map((c) => ({
              tipo: c.tipo as
                | "telefone_fixo"
                | "whatsapp"
                | "telefone_comercial"
                | "sac"
                | "email"
                | "formulario"
                | "central_comercial"
                | "site"
                | "linkedin",
              valor: c.valor,
              origem: c.origem,
              evidencia: c.evidencia ?? null,
            })),
            commercial_context_hash: commercialContextHash(oQueVende, diferencial, infoExtra),
            decisionMakers: (l.decisionMakers ?? []).map((dm) => ({
              name: dm.name,
              title: dm.title,
              area: dm.area,
              priority: dm.priority,
              score: dm.score,
              probabilidade_decisor: dm.probabilidade_decisor,
              linkedin_url: dm.linkedinUrl,
              employment_verified: dm.employment_verified,
              source: dm.source,
              evidence: dm.evidence,
              commercial_context_hash: commercialContextHash(oQueVende, diferencial, infoExtra),
            })),
          })),
        },
      });
      setCrmResult(res);
      // Limpa seleção para facilitar o próximo lote (5 para Y, 5 para X…)
      setSelected(new Set());
    } catch (e) {
      setCrmResult({
        summary: { created: 0, updated: 0, failed: scope.length },
        results: [
          {
            organization: "—",
            status: "failed",
            error: e instanceof Error ? e.message : String(e),
          },
        ],
      });
    } finally {
      setCrmLoading(false);
    }
  }

  const [importOpen, setImportOpen] = useState(false);

  async function onLogout() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  async function onIntelligence(empresa: string) {
    // UX: abrir a aba IMEDIATAMENTE (evita bloqueio de pop-up) e deixar a
    // geração acontecer na própria página de relatório.
    // Persiste contexto do produto para priorização de TDs.
    if (typeof window !== "undefined") {
      try {
        sessionStorage.setItem(
          "lf-intel-ctx",
          JSON.stringify({
            oQueVende: oQueVende.trim() || undefined,
            diferencial: diferencial.trim() || undefined,
            infoExtra: infoExtra.trim() || undefined,
          }),
        );
      } catch {
        /* private mode */
      }
      const url = `/inteligencia/relatorio?pending=${encodeURIComponent(empresa)}`;
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
    setIntelligencePending((m) => ({ ...m, [empresa]: true }));
    try {
      const res = await intelligenceFn({
        data: {
          companyName: empresa,
          sourceLeadEmpresa: empresa,
          oQueVende: oQueVende.trim() || undefined,
          diferencial: diferencial.trim() || undefined,
          infoExtra: infoExtra.trim() || undefined,
        },
      });
      navigate({ to: "/inteligencia/relatorio", search: { id: res.id } });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro ao gerar dossiê");
    } finally {
      setIntelligencePending((m) => ({ ...m, [empresa]: false }));
    }
  }

  return (
    <main className="min-h-full">
      <div className="max-w-3xl mx-auto px-4 pt-10 pb-20 sm:pt-16">
        <header className="text-white mb-8">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-white/85 text-xs font-semibold hover:text-white mb-4"
          >
            <ArrowLeft className="w-4 h-4" /> Home
          </Link>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur text-xs font-semibold tracking-wide">
                <Sparkles className="w-3.5 h-3.5" /> PROSPECÇÃO B2B COM IA
              </div>
              <button
                type="button"
                onClick={() => setImportOpen(true)}
                className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#0F4C5C] text-white text-xs font-semibold hover:bg-[#2E7A85] transition"
              >
                Importar planilha CSV
              </button>
              <h1 className="mt-4 text-4xl sm:text-5xl font-extrabold leading-tight tracking-tight">
                Descubra empresas ideais em segundos.
              </h1>
              <p className="mt-3 text-white/85 text-base sm:text-lg max-w-xl">
                Combinamos web search em tempo real com curadoria por IA para entregar leads B2B
                alinhados ao seu ICP.
              </p>
            </div>
            <div className="shrink-0 flex items-center gap-2">
              <Link
                to="/inteligencia/historico"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur text-white text-xs font-semibold transition"
              >
                <Brain className="w-3.5 h-3.5" /> Histórico
              </Link>
              <button
                type="button"
                onClick={onLogout}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur text-white text-xs font-semibold transition"
              >
                <LogOut className="w-3.5 h-3.5" /> Sair
              </button>
            </div>
          </div>
        </header>

        <section className="bg-[var(--cy-card)] border border-[var(--cy-card-border)] rounded-xl p-5 sm:p-6 space-y-5">
          <div>
            <h2 className="text-lg font-extrabold">Perfil de Cliente Ideal (ICP)</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Descreva as empresas que você quer prospectar — o setor delas, não o seu.
            </p>
          </div>

          <div>
            <label className="block text-sm font-bold text-foreground mb-2">
              Macro-setores do cliente-alvo (até 3)
              {macros.length > 0 && (
                <span className="text-muted-foreground font-normal">
                  {" "}
                  — {macros.length}/3 selecionado(s)
                </span>
              )}
            </label>
            <div className="flex flex-wrap gap-2">
              {Object.keys(SETORES).map((s) => {
                const active = macros.includes(s);
                const blocked = !active && macros.length >= 3;
                return (
                  <Chip key={s} active={active} disabled={blocked} onClick={() => toggleMacro(s)}>
                    {s}
                  </Chip>
                );
              })}
            </div>
            {macroLimitWarning && (
              <p className="mt-2 text-xs text-amber-400 font-semibold">
                Limite atingido: você pode selecionar no máximo 3 macro-setores.
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-bold text-foreground mb-3">
              Micro-setores do cliente-alvo (até 5){" "}
              {macros.length === 0 ? (
                <span className="text-muted-foreground font-normal">
                  (escolha ao menos um macro)
                </span>
              ) : (
                micros.length > 0 && (
                  <span className="text-muted-foreground font-normal">
                    — {micros.length}/5 selecionado(s)
                  </span>
                )
              )}
            </label>
            {macros.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {microOptions.map((m) => {
                  const active = micros.includes(m);
                  const blocked = !active && micros.length >= 5;
                  const meta = MICRO_META[m];
                  const tip = meta
                    ? `${meta.description}${meta.cnaeGroups.length ? ` · CNAE: ${meta.cnaeGroups.join("; ")}` : ""}${meta.cnaeToValidar ? " · (CNAE a validar)" : ""}`
                    : m;
                  return (
                    <span key={m} title={tip} className="inline-flex">
                      <Chip active={active} disabled={blocked} onClick={() => toggleMicro(m)}>
                        {m}
                      </Chip>
                    </span>
                  );
                })}
              </div>
            ) : (
              <div className="h-12 rounded-2xl border border-dashed border-border bg-secondary/40 flex items-center px-4 text-sm text-muted-foreground">
                Selecione um macro-setor acima
              </div>
            )}
            {micros.length > 0 && (
              <ul className="mt-3 space-y-1.5 text-[11px] text-muted-foreground">
                {micros.map((m) => {
                  const meta = MICRO_META[m];
                  if (!meta) return null;
                  return (
                    <li key={m} className="leading-snug">
                      <span className="font-semibold text-foreground">{m}</span>
                      {meta.cnaeGroups.length > 0 && (
                        <span>
                          {" "}
                          · CNAE {meta.cnaeGroups.join("; ")}
                          {meta.cnaeToValidar ? " (validar)" : ""}
                        </span>
                      )}
                      <span className="block opacity-90">{meta.description}</span>
                    </li>
                  );
                })}
              </ul>
            )}
            {microLimitWarning && (
              <p className="mt-2 text-xs text-amber-400 font-semibold">
                Limite atingido: você pode selecionar no máximo 5 micro-setores.
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-bold text-foreground mb-3">
              Porte do cliente-alvo (headcount)
            </label>
            <div className="flex flex-wrap gap-2">
              {PORTES.map((p) => (
                <Chip key={p} active={porte === p} onClick={() => setPorte(p)}>
                  {p}
                </Chip>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-foreground mb-2">
              Estado do cliente-alvo (até 3){" "}
              {estados.length > 0 && (
                <span className="text-muted-foreground font-normal">— {estados.join(", ")}</span>
              )}
            </label>
            <button
              type="button"
              onClick={() => setUfOpen((v) => !v)}
              className="w-full h-12 rounded-2xl border border-border bg-white px-4 text-sm font-medium text-left flex items-center justify-between hover:border-foreground/50 transition"
            >
              <span className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-muted-foreground" />
                {estados.length === 0
                  ? "Selecione até 3 estados"
                  : `${estados.length} selecionado(s)`}
              </span>
              <span className="text-muted-foreground text-xs">{ufOpen ? "Fechar" : "Abrir"}</span>
            </button>
            {ufOpen && (
              <div className="mt-3 p-3 rounded-2xl border border-border bg-secondary/40 flex flex-wrap gap-2">
                {UFS.map((uf) => {
                  const active = estados.includes(uf);
                  const blocked =
                    !active &&
                    estados.length >= 3 &&
                    uf !== "Brasil Todo" &&
                    !estados.includes("Brasil Todo");
                  return (
                    <Chip
                      key={uf}
                      active={active}
                      disabled={blocked}
                      onClick={() => toggleEstado(uf)}
                    >
                      {active && <Check className="inline w-3 h-3 mr-1 -mt-0.5" />}
                      {uf}
                    </Chip>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-bold text-foreground mb-3">
              Quantidade de leads
            </label>
            <div className="flex flex-wrap gap-2">
              {QUANTIDADES.map((q) => (
                <Chip key={q} active={quantidade === q} onClick={() => setQuantidade(q)}>
                  {q} Leads
                </Chip>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-foreground mb-1">
              Modo de Exploração
            </label>
            <p className="text-xs text-muted-foreground mb-3">
              Como lidar com empresas já vistas no seu histórico.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {(
                [
                  {
                    value: "validados",
                    label: "Validados",
                    desc: "Exclui últimos 45 leads (padrão, mais seguro)",
                    icon: "🔒",
                  },
                  {
                    value: "novo",
                    label: "Novo",
                    desc: "Exclui últimos 15 leads (exploração moderada)",
                    icon: "🔄",
                  },
                  {
                    value: "agressivo",
                    label: "Agressivo",
                    desc: "Ignora histórico (máxima descoberta)",
                    icon: "🚀",
                  },
                ] as const
              ).map((mode) => (
                <button
                  key={mode.value}
                  type="button"
                  onClick={() => setExploracaoModo(mode.value)}
                  className={cn(
                    "p-3 rounded-lg border text-xs font-medium transition text-left",
                    exploracaoModo === mode.value
                      ? "bg-[#0F4C5C] border-[#0F4C5C] text-white shadow-lg"
                      : "bg-[var(--cy-surface-hover)] border-[var(--cy-card-border)] text-muted-foreground hover:border-[#0F4C5C] hover:bg-[var(--cy-surface-active)]",
                  )}
                >
                  <div className="text-lg mb-1">{mode.icon}</div>
                  <div className="font-bold mb-1">{mode.label}</div>
                  <div className="text-[11px] opacity-90 leading-snug">{mode.desc}</div>
                </button>
              ))}
            </div>

            <label className="mt-3 flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={skipCache}
                onChange={(e) => setSkipCache(e.target.checked)}
                className="w-4 h-4 mt-1 cursor-pointer accent-[#0F4C5C]"
              />
              <div>
                <div className="text-xs font-semibold text-foreground">
                  🔄 Forçar Exploração: ignorar cache de 24h
                </div>
                <div className="text-[11px] text-muted-foreground">
                  Executa busca completa mesmo no mesmo dia. Use para máxima variação.
                </div>
              </div>
            </label>
          </div>
        </section>

        <section className="mt-5 bg-[var(--cy-card)] border border-[var(--cy-card-border)] rounded-xl p-5 sm:p-6 space-y-4">
          <div>
            <h2 className="text-lg font-extrabold">Seu negócio (para gerar o "fit")</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Usado apenas para justificar por que cada lead precisa de você — nunca como filtro de
              busca. A IA descarta empresas que sejam concorrentes diretas.
            </p>
          </div>

          <div>
            <label className="block text-sm font-bold text-foreground mb-2">
              O que <strong>você</strong> vende? (seu produto/serviço)
            </label>
            <input
              type="text"
              value={oQueVende}
              onChange={(e) => setOQueVende(e.target.value)}
              placeholder="Ex: Marketing Médico, Plano de Saúde, Software CRM…"
              className="w-full h-10 rounded-lg border border-[var(--cy-card-border)] bg-[var(--cy-input-bg)] px-3 text-sm text-[var(--cy-content-ink)] outline-none focus:border-[#0F4C5C] transition"
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
              Isto descreve o seu negócio, não o setor-alvo. A IA irá excluir concorrentes.
            </p>
          </div>

          <div>
            <label className="block text-sm font-bold text-foreground mb-2">
              Qual o seu diferencial?{" "}
              <span className="text-muted-foreground font-normal">(Opcional)</span>
            </label>
            <input
              type="text"
              value={diferencial}
              onChange={(e) => setDiferencial(e.target.value)}
              placeholder="Ex: Preço competitivo, Atendimento 24/7…"
              className="w-full h-10 rounded-lg border border-[var(--cy-card-border)] bg-[var(--cy-input-bg)] px-3 text-sm text-[var(--cy-content-ink)] outline-none focus:border-[#0F4C5C] transition"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-foreground mb-2">
              Informação Extra / Direcionamento{" "}
              <span className="text-muted-foreground font-normal">(Opcional)</span>
            </label>
            <textarea
              rows={3}
              value={infoExtra}
              onChange={(e) => setInfoExtra(e.target.value)}
              placeholder="Ex: Priorize empresas com frota própria, ou empresas com filiais…"
              className="w-full rounded-lg border border-[var(--cy-card-border)] bg-[var(--cy-input-bg)] px-3 py-2.5 text-sm text-[var(--cy-content-ink)] outline-none focus:border-[#0F4C5C] transition resize-none"
            />
          </div>

          <button
            type="button"
            onClick={onSubmit}
            disabled={!canSubmit}
            className={cn(
              "w-full h-11 rounded-lg text-sm font-semibold text-white transition-all",
              "bg-[#0F4C5C] hover:bg-[#2E7A85]",
              "shadow-[0_4px_20px_rgba(15, 76, 92, 0.35)]",
              "disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.99]",
            )}
          >
            {loading ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                Buscando, verificando sites e curando com IA…
              </span>
            ) : (
              "Gerar lista de leads"
            )}
          </button>

          {error && (
            <div className="rounded-2xl border border-destructive/30 bg-destructive/5 text-destructive text-sm p-4">
              {error}
            </div>
          )}
        </section>

        {loading && (
          <section className="mt-5 bg-[var(--cy-card)] border border-[var(--cy-card-border)] rounded-xl p-5 sm:p-6 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 animate-pulse">
                <div className="w-12 h-12 rounded-full bg-secondary" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-1/3 bg-secondary rounded" />
                  <div className="h-2 w-2/3 bg-secondary rounded" />
                </div>
              </div>
            ))}
          </section>
        )}

        {leads && (
          <section className="mt-5 bg-[var(--cy-card)] border border-[var(--cy-card-border)] rounded-xl p-5 sm:p-6">
            <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
              <div>
                <h2 className="text-xl sm:text-2xl font-extrabold">Leads gerados</h2>
                <span className="text-xs font-semibold text-muted-foreground">
                  {leads.length} resultados
                  {cached ? " · cache recente" : ""}
                  {skipCache && " · 🔄 exploração forçada"}
                  {randomized && " · ✨ resultado embaralhado"}
                  {selected.size > 0 && ` · ${selected.size} selecionado(s)`}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {leads.length > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      setSelected((prev) =>
                        prev.size === leads.length
                          ? new Set()
                          : new Set(leads.map((l) => l.empresa)),
                      )
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full border border-border text-foreground text-xs font-semibold hover:bg-secondary transition"
                  >
                    {selected.size === leads.length ? (
                      <CheckSquare className="w-3.5 h-3.5" />
                    ) : (
                      <Square className="w-3.5 h-3.5" />
                    )}
                    {selected.size === leads.length ? "Limpar seleção" : "Selecionar tudo"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    const scope =
                      selected.size > 0 ? leads.filter((l) => selected.has(l.empresa)) : leads;
                    downloadCsv(scope, oQueVende);
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-[#0F9D58] hover:bg-[#0b8043] text-white text-sm font-bold shadow-sm transition"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  {selected.size > 0
                    ? `Exportar ${selected.size} selecionado(s)`
                    : "Exportar para Planilha Google"}
                </button>
                <button
                  type="button"
                  onClick={() => void openCrmModal()}
                  disabled={crmLoading || leads.length === 0}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-[#0F4C5C] hover:bg-[#2E7A85] text-white text-sm font-bold shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {crmLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Kanban className="w-4 h-4" />
                  )}
                  {crmLoading
                    ? "Enviando…"
                    : selected.size > 0
                      ? `Enviar ${selected.size} ao CRM / SDR`
                      : "Enviar ao CRM / SDR"}
                </button>
              </div>
            </div>

            {crmResult && (
              <div
                className={cn(
                  "mb-5 rounded-2xl border p-4 text-sm",
                  crmResult.summary.failed > 0
                    ? "border-amber-500/30 bg-amber-500/10"
                    : "border-emerald-500/30 bg-emerald-500/10",
                )}
              >
                <p className="font-semibold text-foreground">
                  CRM: {crmResult.summary.created} criado(s), {crmResult.summary.updated}{" "}
                  atualizado(s)
                  {crmResult.summary.failed > 0 && `, ${crmResult.summary.failed} com erro`}.
                </p>
                <Link
                  to="/crm"
                  className="mt-2 inline-block text-xs text-[var(--cy-muted)] hover:underline"
                >
                  Abrir Kanban →
                </Link>
              </div>
            )}

            {leads.length === 0 && (
              <div className="text-center py-10 px-4 rounded-2xl border border-dashed border-border bg-secondary/30">
                <p className="text-sm font-semibold text-foreground">
                  Nenhum lead novo encontrado.
                </p>
                <p className="text-xs text-muted-foreground mt-1.5">
                  Ajuste os filtros (setor, porte ou estado) e tente de novo. Também vale trocar o
                  "O que você vende" para dar mais contexto à IA.
                </p>
              </div>
            )}
            <ul className="divide-y divide-[#0f3038]">
              {leads.map((lead, i) => {
                const currentFeedback = feedbackMap[lead.empresa];
                const pending = feedbackPending[lead.empresa];
                const isHigh = lead.confianca === "alta";
                const isSelected = selected.has(lead.empresa);
                const fitScore =
                  lead.confianca === "alta" ? 88 : lead.confianca === "media" ? 65 : 40;
                return (
                  <li key={i}>
                    <div className="flex items-center gap-3 h-11 px-2 hover:bg-[var(--cy-input-bg)] transition group border-b border-[#0f3038] last:border-0">
                      {/* select */}
                      <button
                        type="button"
                        onClick={() =>
                          setSelected((prev) => {
                            const next = new Set(prev);
                            if (next.has(lead.empresa)) next.delete(lead.empresa);
                            else next.add(lead.empresa);
                            return next;
                          })
                        }
                        className={cn(
                          "w-4 h-4 shrink-0 rounded border flex items-center justify-center transition",
                          isSelected
                            ? "bg-[#0F4C5C] border-[#0F4C5C] text-white"
                            : "bg-transparent border-[var(--cy-card-border)] hover:border-[#0F4C5C]",
                        )}
                      >
                        {isSelected && <Check className="w-3 h-3" />}
                      </button>

                      {/* avatar */}
                      <div className="w-7 h-7 shrink-0 rounded-md bg-[var(--cy-surface-active)] flex items-center justify-center text-[10px] font-semibold text-[var(--cy-muted)]">
                        {lead.empresa.trim().charAt(0).toUpperCase() || "?"}
                      </div>

                      {/* name + meta */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-medium text-[var(--cy-content-ink)] truncate">
                            {lead.empresa}
                          </span>
                          <span
                            className={cn(
                              "text-[10px] font-medium px-1.5 py-0.5 rounded",
                              isHigh
                                ? "bg-[#27a644]/20 text-[#4ade80]"
                                : "bg-[#f5a623]/15 text-[#fbbf24]",
                            )}
                          >
                            {confiancaLabel(lead.confianca)}
                          </span>
                        </div>
                        <div className="text-[11px] text-[var(--cy-muted)] truncate">
                          {lead.segmento} · {lead.uf}
                          {lead.municipio ? ` · ${lead.municipio}` : ""}
                        </div>
                      </div>

                      {/* quick actions */}
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                        {lead.website && (
                          <a
                            href={lead.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded hover:bg-[var(--cy-surface-active)] text-[var(--cy-muted)] hover:text-white"
                            title="Site"
                          >
                            <Globe className="w-3.5 h-3.5" />
                          </a>
                        )}
                        {lead.linkedin && (
                          <a
                            href={lead.linkedin}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded hover:bg-[var(--cy-surface-active)] text-[var(--cy-muted)] hover:text-white"
                            title="LinkedIn"
                          >
                            <Linkedin className="w-3.5 h-3.5" />
                          </a>
                        )}
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => onFeedback(lead.empresa, "good")}
                          className={cn(
                            "p-1.5 rounded hover:bg-[var(--cy-surface-active)]",
                            currentFeedback === "good"
                              ? "text-[#4ade80]"
                              : "text-[var(--cy-muted)] hover:text-white",
                          )}
                        >
                          <ThumbsUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => onFeedback(lead.empresa, "bad")}
                          className={cn(
                            "p-1.5 rounded hover:bg-[var(--cy-surface-active)]",
                            currentFeedback === "bad"
                              ? "text-[#f87171]"
                              : "text-[var(--cy-muted)] hover:text-white",
                          )}
                        >
                          <ThumbsDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={intelligencePending[lead.empresa]}
                          onClick={() => onIntelligence(lead.empresa)}
                          className="p-1.5 rounded hover:bg-[var(--cy-surface-active)] text-[var(--cy-muted)] hover:text-[#0F4C5C]"
                          title="Inteligência"
                        >
                          {intelligencePending[lead.empresa] ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Brain className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="mt-6 text-xs text-muted-foreground/80 leading-relaxed">
              Nota: sites são verificados via leitura direta da página (fetch + parser). O selo "A
              validar" indica que o site não foi confirmado ou não há sinal concreto — cheque
              manualmente antes da abordagem.
            </p>
          </section>
        )}
      </div>

      {/* Modal: escolher SDR para o lote */}
      {crmModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setCrmModalOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-[var(--cy-card-border)] bg-[var(--cy-card)] p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center gap-2">
              <Users className="h-4 w-4 text-[#0F4C5C]" />
              <h3 className="flex-1 text-base font-semibold text-[var(--cy-content-ink)]">
                Enviar ao CRM
              </h3>
              <button
                type="button"
                onClick={() => setCrmModalOpen(false)}
                className="rounded-lg p-1 text-[var(--cy-muted)] hover:bg-[var(--cy-surface-hover)] hover:text-[var(--cy-content-ink)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mb-3 text-xs text-[var(--cy-muted)] leading-relaxed">
              {selected.size > 0
                ? `${selected.size} lead(s) selecionado(s). Escolha o SDR que vai receber este lote. Depois você pode selecionar outro lote e enviar para outro SDR.`
                : `Todos os ${leads?.length ?? 0} leads serão enviados. Selecione um SDR ou envie sem atribuição.`}
            </p>

            <label className="mb-1.5 block text-xs font-semibold text-[var(--cy-muted)]">
              Atribuir a SDR
            </label>
            {sdrsLoading ? (
              <div className="mb-4 flex items-center gap-2 text-xs text-[var(--cy-muted)]">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando equipe…
              </div>
            ) : (
              <select
                value={assignSdrId}
                onChange={(e) => setAssignSdrId(e.target.value)}
                className="mb-4 w-full rounded-xl border border-[var(--cy-card-border)] bg-[var(--cy-input-bg)] px-3 py-2.5 text-sm text-[var(--cy-content-ink)] outline-none focus:border-[#0F4C5C]"
              >
                <option value="">— Sem atribuição (só entra no Kanban) —</option>
                {sdrs.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name || s.email}
                  </option>
                ))}
              </select>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setCrmModalOpen(false)}
                className="flex-1 rounded-xl border border-[var(--cy-card-border)] bg-[var(--cy-input-bg)] py-2.5 text-sm font-semibold text-[var(--cy-muted)] hover:bg-[var(--cy-surface-hover)]"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={crmLoading}
                onClick={() => void onSendToCrm(assignSdrId || null)}
                className="flex-1 rounded-xl bg-[#0F4C5C] py-2.5 text-sm font-semibold text-white hover:bg-[#2E7A85] disabled:opacity-50"
              >
                {crmLoading ? "Enviando…" : "Confirmar envio"}
              </button>
            </div>
          </div>
        </div>
      )}
      <LeadImportModal open={importOpen} onClose={() => setImportOpen(false)} />
    </main>
  );
}
