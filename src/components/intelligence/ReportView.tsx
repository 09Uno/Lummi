import {
  ExternalLink,
  Linkedin,
  MapPin,
  Newspaper,
  GraduationCap,
  Gift,
  Search,
  Target,
  AlertTriangle,
  MessageCircleQuestion,
  Building2,
} from "lucide-react";
import type { CompanyReport, EducationalMaturity } from "@/lib/lummi-data";
import { CompanyLogo } from "./CompanyLogo";
import { InvestmentSimulation } from "./InvestmentSimulation";
import { cn } from "@/lib/utils";

function maturityClasses(c: EducationalMaturity): { badge: string; bar: string } {
  if (c === "Avançada") return { badge: "bg-emerald-600 text-white", bar: "bg-emerald-500" };
  if (c === "Intermediária") return { badge: "bg-sky-600 text-white", bar: "bg-sky-500" };
  if (c === "Básica") return { badge: "bg-amber-500 text-white", bar: "bg-amber-500" };
  return { badge: "bg-rose-600 text-white", bar: "bg-rose-500" };
}

function maturityPercent(c: EducationalMaturity): number {
  return c === "Avançada" ? 100 : c === "Intermediária" ? 70 : c === "Básica" ? 40 : 10;
}

export function ReportView({ report }: { report: CompanyReport }) {
  const eduClasses = maturityClasses(report.educationalMaturity.level);
  const eduPct = maturityPercent(report.educationalMaturity.level);

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <section className="rounded-3xl p-6 flex flex-col md:flex-row items-center gap-6 shadow-card-soft bg-hero-gradient">
        <CompanyLogo name={report.name} website={report.website} />
        <div className="flex-1 text-center md:text-left min-w-0">
          <p className="text-[11px] uppercase tracking-widest text-white/70 font-bold">
            Dossiê de Inteligência Comercial
          </p>
          <h2 className="text-2xl md:text-3xl font-extrabold text-white truncate">{report.name}</h2>
          {report.legalName && report.legalName !== report.name && (
            <p className="text-sm text-white/80 truncate">{report.legalName}</p>
          )}
          <div className="flex flex-wrap items-center justify-center md:justify-start gap-x-4 gap-y-2 mt-2 text-sm text-white/90">
            {report.website && (
              <a
                href={`https://${report.website}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 hover:text-white transition-colors"
              >
                <ExternalLink size={14} />
                {report.website}
              </a>
            )}
            {report.linkedinUrl && (
              <a
                href={report.linkedinUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 hover:text-white transition-colors"
              >
                <Linkedin size={14} />
                LinkedIn
              </a>
            )}
            {report.headquarters && (
              <span className="flex items-center gap-1.5">
                <MapPin size={14} />
                {report.headquarters}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col items-center px-6 py-4 rounded-2xl bg-white/15 backdrop-blur">
          <span className="text-[11px] font-bold uppercase tracking-widest text-white/70">
            Score de Fit
          </span>
          <span className="text-4xl font-black text-white">
            {report.fitScore}
            <span className="text-lg text-white/60">/10</span>
          </span>
        </div>
      </section>

      {/* 1. Resumo Executivo */}
      <SectionCard title="1. Resumo Executivo" icon={<Target size={14} />}>
        <p className="text-foreground/90 leading-relaxed text-sm">{report.executiveSummary}</p>
      </SectionCard>

      {/* 2. Perfil Corporativo */}
      <SectionCard title="2. Perfil Corporativo" icon={<Building2 size={14} />}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <DetailCard label="Segmento" value={report.segment} />
          <DetailCard label="Fundação" value={report.foundedYear} />
          <DetailCard label="Sede" value={report.headquarters} />
          <DetailCard label="Funcionários" value={report.employees} />
          <DetailCard label="Porte" value={report.size} />
          <DetailCard label="Faturamento" value={report.revenue} />
          <DetailCard label="CNPJ" value={report.cnpj} />
          <DetailCard label="Presença Geográfica" value={report.geographicPresence} />
        </div>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          <KeyValueBlock
            label="Produtos / Serviços"
            value={
              report.products.length
                ? report.products.join(" • ")
                : "Informação não localizada em fontes abertas"
            }
          />
          <KeyValueBlock label="Posicionamento de Mercado" value={report.marketPositioning} />
        </div>
      </SectionCard>

      {/* 3. Notícias */}
      <SectionCard title="3. Momento Atual e Notícias Relevantes" icon={<Newspaper size={14} />}>
        {report.recentNews.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">
            Informação não localizada em fontes abertas.
          </p>
        ) : (
          <ul className="space-y-3">
            {report.recentNews.map((n, idx) => (
              <li
                key={idx}
                className="flex gap-3 text-sm text-foreground/90 leading-relaxed border-l-2 border-primary pl-3"
              >
                <span className="font-bold text-primary shrink-0 w-24">{n.date || "—"}</span>
                <span className="flex-1">
                  {n.fact}
                  {n.source && (
                    <span className="text-muted-foreground text-xs ml-2">({n.source})</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {/* 4. Cultura de Benefícios */}
      <SectionCard
        title="4. Cultura de Benefícios (Foco Educacional)"
        icon={<GraduationCap size={14} />}
      >
        <div className="space-y-5">
          <div className="bg-secondary/40 rounded-2xl p-4 border border-border">
            <div className="flex justify-between items-end mb-3">
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                Maturidade da Cultura Educacional
              </span>
              <span
                className={cn(
                  "px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest",
                  eduClasses.badge,
                )}
              >
                {report.educationalMaturity.level}
              </span>
            </div>
            <div className="w-full bg-border rounded-full h-2 overflow-hidden mb-3">
              <div
                className={cn("h-2 rounded-full transition-all duration-1000", eduClasses.bar)}
                style={{ width: `${eduPct}%` }}
              />
            </div>
            <p className="text-sm text-foreground/90 leading-relaxed">
              {report.educationalMaturity.justification}
            </p>
          </div>

          <div>
            <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-2">
              <GraduationCap size={12} /> Benefícios Educacionais
            </h4>
            {report.educationalBenefits.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">
                Nenhum benefício educacional identificado em fontes abertas.
              </p>
            ) : (
              <ul className="space-y-2">
                {report.educationalBenefits.map((b, i) => (
                  <li
                    key={i}
                    className="bg-secondary/40 border border-border rounded-xl p-3 text-sm text-foreground/90"
                  >
                    <span className="font-bold text-foreground">{b.type}:</span> {b.detail}
                    {b.source && (
                      <span className="block text-xs text-muted-foreground mt-1">
                        Fonte: {b.source}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-2">
              <Gift size={12} /> Benefícios Gerais
            </h4>
            {report.generalBenefits.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">
                Informação não localizada em fontes abertas.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {report.generalBenefits.map((b, i) => (
                  <span
                    key={i}
                    className="bg-secondary text-foreground px-3 py-1.5 rounded-full text-sm font-semibold border border-border"
                    title={b.source ? `Fonte: ${b.source}` : undefined}
                  >
                    {b.benefit}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div>
            <h4 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-2">
              <Search size={12} /> Canais Consultados
            </h4>
            {report.consultedChannels.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">—</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {report.consultedChannels.map((c, i) => (
                  <div
                    key={i}
                    className="bg-secondary/40 border border-border rounded-xl p-3 text-sm"
                  >
                    <p className="font-bold text-foreground">{c.channel}</p>
                    <p className="text-muted-foreground text-xs mt-1">{c.findings}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </SectionCard>

      {/* Simulação */}
      <InvestmentSimulation employees={report.employees} />

      {/* 5. Abordagem */}
      <SectionCard title="5. Abordagem Recomendada" icon={<Target size={14} />}>
        {report.recommendedApproach.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">—</p>
        ) : (
          <ul className="space-y-3">
            {report.recommendedApproach.map((a, i) => (
              <li key={i} className="flex gap-3 text-sm text-foreground/90 leading-relaxed">
                <span className="font-extrabold text-primary">{i + 1}.</span>
                {a}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      {/* Oportunidades + Riscos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <SectionCard title="Oportunidades" icon={<Target size={14} className="text-emerald-600" />}>
          <ul className="space-y-3">
            {report.opportunities.map((o) => (
              <li key={o} className="flex gap-3 text-sm text-foreground/90 leading-relaxed">
                <span className="font-bold text-emerald-600">•</span>
                {o}
              </li>
            ))}
          </ul>
        </SectionCard>
        <SectionCard
          title="Riscos / Objeções"
          icon={<AlertTriangle size={14} className="text-rose-600" />}
        >
          <ul className="space-y-3">
            {report.risks.map((r) => (
              <li key={r} className="flex gap-3 text-sm text-foreground/90 leading-relaxed">
                <span className="font-bold text-rose-600">•</span>
                {r}
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>

      {/* Discovery */}
      <SectionCard title="Perguntas para Descoberta" icon={<MessageCircleQuestion size={14} />}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {report.discoveryQuestions.map((q) => (
            <div
              key={q}
              className="p-4 bg-secondary/40 border border-border rounded-2xl text-foreground/90 text-sm font-medium italic"
            >
              "{q}"
            </div>
          ))}
        </div>
      </SectionCard>

      {/* 6. Pontos de atenção */}
      <div
        className="rounded-3xl p-6 shadow-card-soft border"
        style={{ background: "rgba(245, 166, 35, 0.08)", borderColor: "rgba(245, 166, 35, 0.45)" }}
      >
        <h3
          className="font-bold text-xs uppercase tracking-widest mb-3 flex items-center gap-2"
          style={{ color: "#fbbf24" }}
        >
          <AlertTriangle size={14} />
          6. Pontos de Atenção
        </h3>
        {report.attentionPoints.length === 0 ? (
          <p className="text-sm italic" style={{ color: "#d0d6e0" }}>
            Nenhum ponto crítico identificado.
          </p>
        ) : (
          <ul className="space-y-2">
            {report.attentionPoints.map((p) => (
              <li
                key={p}
                className="flex gap-3 text-sm leading-relaxed"
                style={{ color: "#f7f8f8" }}
              >
                <span
                  className="flex-shrink-0 inline-flex items-center justify-center w-5 h-5 rounded-full font-bold text-xs"
                  style={{ background: "#f5a623", color: "#0f1011" }}
                  aria-hidden
                >
                  !
                </span>
                <span>{p}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground text-center pt-2">{report.dataCoverage}</p>
    </div>
  );
}

function DetailCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-secondary/40 p-3 rounded-2xl border border-border shadow-sm border-l-4 border-l-primary">
      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
        {label}
      </p>
      <p className="text-sm font-bold text-foreground mt-1 break-words">{value}</p>
    </div>
  );
}

function KeyValueBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-secondary/40 p-4 rounded-2xl border border-border">
      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">
        {label}
      </p>
      <p className="text-sm text-foreground/90 leading-relaxed">{value}</p>
    </div>
  );
}

function SectionCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-card rounded-3xl p-6 border border-border shadow-card-soft">
      <h3 className="font-bold text-xs uppercase tracking-widest text-muted-foreground mb-4 flex items-center gap-2">
        <span className="text-primary">{icon}</span>
        {title}
      </h3>
      {children}
    </section>
  );
}
