import { exportLeadsToHubspot } from "@/lib/hubspot.functions";
import type { HubspotLeadResult } from "@/lib/hubspot.functions";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import {
  Loader2,
  Sparkles,
  Building2,
  MapPin,
  Check,
  Globe,
  Linkedin,
  LogOut,
  FileSpreadsheet,
  ShieldCheck,
  ShieldAlert,
  ThumbsUp,
  ThumbsDown,
  Brain,
  ArrowLeft,
  CheckSquare,
  Square,
} from "lucide-react";
import { generateIntelligenceReport } from "@/lib/intelligence-report.functions";
import { generateLeads, submitLeadFeedback } from "@/lib/leads.functions";
import type { EnrichedLead } from "@/lib/leads.functions";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { LeadRow } from "@/components/ui/LeadRow";

export const Route = createFileRoute("/_authenticated/prospeccao")({
  component: Index,
});

const SETORES: Record<string, string[]> = {
  "Construção e Imobiliário": [
    "Construtoras",
    "Incorporadoras",
    "Imobiliárias",
    "Arquitetura e Engenharia",
    "Gestão de Condomínios",
  ],
  Agronegócio: [
    "Produção Agrícola",
    "Pecuária",
    "Distribuição de Insumos",
    "Cooperativas Agroindustriais",
    "Maquinário",
  ],
  "Indústria e Manufatura": [
    "Indústria Alimentícia",
    "Bens de Consumo",
    "Metalurgia",
    "Indústria Automotiva",
    "Embalagens",
  ],
  "Varejo e Atacado": [
    "Supermercados",
    "Franquias",
    "Atacarejo",
    "Vestuário",
    "Material de Construção",
    "E-commerce",
    "Alimentação & Gastronomia",
    "Marketplaces",
    "Moda e Estilo",
    "Beleza e Cosmética",
  ],
  "Logística e Transporte": [
    "Transporte Rodoviário de Cargas",
    "Operadores Logísticos",
    "Armazenagem",
    "Aviação",
    "Logística de Última Milha",
    "E-commerce Fulfillment",
    "Delivery & Courier",
    "Portos e Navegação",
    "Mobilidade Urbana",
  ],
  "Saúde e Bem-estar": [
    "Hospitais",
    "Clínicas Médicas",
    "Consultórios e Médicos Autônomos",
    "Indústria Farmacêutica",
    "Planos de Saúde",
    "Odontologia",
    "HealthTechs",
  ],
  "Serviços Profissionais B2B": [
    "Escritórios de Advocacia",
    "Contabilidade",
    "Consultoria Empresarial",
    "Agências de Marketing",
    "Terceirização (BPO)",
  ],
  "Serviços Financeiros": [
    "Bancos Tradicionais",
    "Cooperativas de Crédito",
    "Fintechs",
    "Seguradoras",
    "Gestão de Patrimônio",
    "Seguros & Resseguros",
    "Investimentos e Fundos",
    "Criptomoedas & Blockchain",
  ],
  Tecnologia: [
    "SaaS B2B",
    "Cibersegurança",
    "Infraestrutura de TI",
    "IA",
    "Hardware",
    "Startups & Scale-ups",
    "Fintechs",
    "Healthtechs",
    "Agritechs",
    "Cloud Computing",
  ],
  Educação: [
    "Escolas Básicas",
    "Ensino Superior",
    "Cursos Profissionalizantes",
    "Treinamento Corporativo",
    "EdTech",
  ],
  "Turismo & Hotelaria": [
    "Hotéis e Resorts",
    "Agências de Turismo",
    "Companhias Aéreas Regionais",
    "Empresas de Eventos",
    "Plataformas de Booking",
  ],
  "Entretenimento & Mídia": [
    "Produção de Conteúdo",
    "Redes Sociais e Influenciadores",
    "Streaming de Vídeo",
    "Editoras e Publicações",
    "Agências de Publicidade",
  ],
  "Energia & Utilidades": [
    "Geração de Energia",
    "Distribuição Elétrica",
    "Gás e Combustíveis",
    "Energias Renováveis",
    "Infraestrutura de Água/Saneamento",
  ],
  Telecomunicações: [
    "Operadoras Móveis",
    "Internet Fixa",
    "Data Centers",
    "Provedores de Internet",
    "Infraestrutura de Telecom",
  ],
};

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
          ? "bg-gradient-to-b from-[#6b73e0] to-[#4a52c4] text-white border-[#7c85ea] ring-2 ring-[#5e6ad2]/60 ring-offset-2 ring-offset-[#0f1011] shadow-[0_4px_14px_-2px_rgba(94,106,210,0.65),inset_0_1px_0_rgba(255,255,255,0.25)] font-semibold scale-[1.03]"
          : "bg-[#18191a] text-[#d0d6e0] border-[#34343a] font-medium hover:border-[#5e6ad2]/60 hover:text-white",
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

const FILTERS_KEY = "lummi:prospeccao:filters:v1";
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
    const raw = window.localStorage.getItem(FILTERS_KEY);
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
  const hubspotFn = useServerFn(exportLeadsToHubspot);
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
  const [leads, setLeads] = useState<EnrichedLead[] | null>(null);
  const [cached, setCached] = useState(false);
  const [randomized, setRandomized] = useState(false);
  const [exploracaoModo, setExploracaoModo] = useState<"validados" | "novo" | "agressivo">(
    "validados",
  );
  const [skipCache, setSkipCache] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedbackMap, setFeedbackMap] = useState<Record<string, "good" | "bad">>({});
  const [feedbackPending, setFeedbackPending] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [hubspotLoading, setHubspotLoading] = useState(false);
  const [hubspotResult, setHubspotResult] = useState<{
    summary: { total: number; created: number; updated: number; failed: number };
    results: HubspotLeadResult[];
  } | null>(null);

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

  async function onExportHubspot() {
    if (!leads || leads.length === 0) return;
    const scope = selected.size > 0 ? leads.filter((l) => selected.has(l.empresa)) : leads;
    if (scope.length === 0) return;
    setHubspotLoading(true);
    setHubspotResult(null);
    try {
      const res = await hubspotFn({
        data: {
          leads: scope.map((l) => ({
            empresa: l.empresa,
            uf: l.uf,
            segmento: l.segmento,
            fit: l.fit,
            website: l.website,
            linkedin: l.linkedin,
            municipio: l.municipio,
          })),
        },
      });
      setHubspotResult(res);
    } catch (e) {
      setHubspotResult({
        summary: { total: scope.length, created: 0, updated: 0, failed: scope.length },
        results: scope.map((l) => ({
          empresa: l.empresa,
          status: "failed" as const,
          error: e instanceof Error ? e.message : "Erro inesperado",
        })),
      });
    } finally {
      setHubspotLoading(false);
    }
  }

  async function onLogout() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  async function onIntelligence(empresa: string) {
    setIntelligencePending((m) => ({ ...m, [empresa]: true }));
    try {
      const res = await intelligenceFn({
        data: { companyName: empresa, sourceLeadEmpresa: empresa },
      });
      // Abre relatório em nova aba conforme requisito de UX
      const url = `/inteligencia/relatorio?id=${encodeURIComponent(res.id)}`;
      if (typeof window !== "undefined") {
        window.open(url, "_blank", "noopener,noreferrer");
      } else {
        navigate({ to: "/inteligencia/relatorio", search: { id: res.id } });
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro ao gerar dossiê");
    } finally {
      setIntelligencePending((m) => ({ ...m, [empresa]: false }));
    }
  }

  return (
    <main className="min-h-screen bg-[#010102] text-[#f7f8f8]">
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

        <section className="bg-[#0f1011] border border-[#23252a] rounded-xl p-5 sm:p-6 space-y-5">
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
                  return (
                    <Chip key={m} active={active} disabled={blocked} onClick={() => toggleMicro(m)}>
                      {m}
                    </Chip>
                  );
                })}
              </div>
            ) : (
              <div className="h-12 rounded-2xl border border-dashed border-border bg-secondary/40 flex items-center px-4 text-sm text-muted-foreground">
                Selecione um macro-setor acima
              </div>
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
                      ? "bg-[#5e6ad2] border-[#5e6ad2] text-white shadow-lg"
                      : "bg-[#18191a] border-[#34343a] text-muted-foreground hover:border-[#5e6ad2] hover:bg-[#1f2023]",
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
                className="w-4 h-4 mt-1 cursor-pointer accent-[#5e6ad2]"
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

        <section className="mt-5 bg-[#0f1011] border border-[#23252a] rounded-xl p-5 sm:p-6 space-y-4">
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
              className="w-full h-10 rounded-lg border border-[#23252a] bg-[#141516] px-3 text-sm text-[#f7f8f8] outline-none focus:border-[#5e6ad2] transition"
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
              className="w-full h-10 rounded-lg border border-[#23252a] bg-[#141516] px-3 text-sm text-[#f7f8f8] outline-none focus:border-[#5e6ad2] transition"
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
              className="w-full rounded-lg border border-[#23252a] bg-[#141516] px-3 py-2.5 text-sm text-[#f7f8f8] outline-none focus:border-[#5e6ad2] transition resize-none"
            />
          </div>

          <button
            type="button"
            onClick={onSubmit}
            disabled={!canSubmit}
            className={cn(
              "w-full h-11 rounded-lg text-sm font-semibold text-white transition-all",
              "bg-[#5e6ad2] hover:bg-[#6e7ae2]",
              "shadow-[0_4px_20px_rgba(94,106,210,0.35)]",
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
          <section className="mt-5 bg-[#0f1011] border border-[#23252a] rounded-xl p-5 sm:p-6 space-y-3">
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
          <section className="mt-5 bg-[#0f1011] border border-[#23252a] rounded-xl p-5 sm:p-6">
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
                  onClick={onExportHubspot}
                  disabled={hubspotLoading || leads.length === 0}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-[#FF7A59] hover:bg-[#e8663f] text-white text-sm font-bold shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {hubspotLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Building2 className="w-4 h-4" />
                  )}
                  {hubspotLoading
                    ? "Enviando…"
                    : selected.size > 0
                      ? `Enviar ${selected.size} para HubSpot`
                      : "Enviar para HubSpot"}
                </button>
              </div>
            </div>

            {hubspotResult && (
              <div
                className={cn(
                  "mb-5 rounded-2xl border p-4 text-sm",
                  hubspotResult.summary.failed > 0
                    ? "border-amber-500/30 bg-amber-500/10"
                    : "border-emerald-500/30 bg-emerald-500/10",
                )}
              >
                <p className="font-semibold text-foreground">
                  HubSpot: {hubspotResult.summary.created} criada(s),{" "}
                  {hubspotResult.summary.updated} atualizada(s)
                  {hubspotResult.summary.failed > 0 && `, ${hubspotResult.summary.failed} com erro`}
                  .
                </p>
                {hubspotResult.results.some((r) => r.status === "failed") && (
                  <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {hubspotResult.results
                      .filter((r) => r.status === "failed")
                      .map((r, i) => (
                        <li key={i}>
                          • {r.empresa}: {r.error}
                        </li>
                      ))}
                  </ul>
                )}
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
            <ul className="divide-y divide-[#1a1b1e]">
              {leads.map((lead, i) => {
                const currentFeedback = feedbackMap[lead.empresa];
                const pending = feedbackPending[lead.empresa];
                const isHigh = lead.confianca === "alta";
                const isSelected = selected.has(lead.empresa);
                const fitScore =
                  lead.confianca === "alta" ? 88 : lead.confianca === "media" ? 65 : 40;
                return (
                  <li key={i}>
                    <div className="flex items-center gap-3 h-11 px-2 hover:bg-[#141516] transition group border-b border-[#1a1b1e] last:border-0">
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
                            ? "bg-[#5e6ad2] border-[#5e6ad2] text-white"
                            : "bg-transparent border-[#34343a] hover:border-[#5e6ad2]",
                        )}
                      >
                        {isSelected && <Check className="w-3 h-3" />}
                      </button>

                      {/* avatar */}
                      <div className="w-7 h-7 shrink-0 rounded-md bg-[#1f2023] flex items-center justify-center text-[10px] font-semibold text-[#8a8f98]">
                        {lead.empresa.trim().charAt(0).toUpperCase() || "?"}
                      </div>

                      {/* name + meta */}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-medium text-[#f7f8f8] truncate">
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
                        <div className="text-[11px] text-[#8a8f98] truncate">
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
                            className="p-1.5 rounded hover:bg-[#1f2023] text-[#8a8f98] hover:text-white"
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
                            className="p-1.5 rounded hover:bg-[#1f2023] text-[#8a8f98] hover:text-white"
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
                            "p-1.5 rounded hover:bg-[#1f2023]",
                            currentFeedback === "good"
                              ? "text-[#4ade80]"
                              : "text-[#8a8f98] hover:text-white",
                          )}
                        >
                          <ThumbsUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => onFeedback(lead.empresa, "bad")}
                          className={cn(
                            "p-1.5 rounded hover:bg-[#1f2023]",
                            currentFeedback === "bad"
                              ? "text-[#f87171]"
                              : "text-[#8a8f98] hover:text-white",
                          )}
                        >
                          <ThumbsDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={intelligencePending[lead.empresa]}
                          onClick={() => onIntelligence(lead.empresa)}
                          className="p-1.5 rounded hover:bg-[#1f2023] text-[#8a8f98] hover:text-[#5e6ad2]"
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
    </main>
  );
}
