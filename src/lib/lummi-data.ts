export type EducationalMaturity = "Inexistente" | "Básica" | "Intermediária" | "Avançada";

export interface NewsItem {
  date: string;
  fact: string;
  source?: string;
  recencyScore?: number;
  relevance?: string;
}

export interface BenefitItem {
  benefit: string;
  source?: string;
}

export interface EducationalBenefitItem {
  type: string;
  detail: string;
  source?: string;
}

export interface ChannelFinding {
  channel: string;
  findings: string;
}

export interface CompanyReport {
  id: string;
  // identidade
  name: string;
  tradeName: string;
  legalName: string;
  cnpj: string;
  website: string;
  linkedinUrl: string;
  // perfil corporativo
  segment: string;
  foundedYear: string;
  headquarters: string;
  employees: string;
  employeeSource?: string;
  employeeUpdatedAt?: string;
  employeeConfidence?: string;

  size: string;
  revenue: string;
  products: string[];
  geographicPresence: string;
  marketPositioning: string;
  // narrativa
  executiveSummary: string;
  recentNews: NewsItem[];
  // benefícios
  generalBenefits: BenefitItem[];
  educationalBenefits: EducationalBenefitItem[];
  consultedChannels: ChannelFinding[];
  educationalMaturity: {
    level: EducationalMaturity;
    justification: string;
  };
  // ação comercial
  fitScore: number;
  recommendedApproach: string[];
  attentionPoints: string[];
  opportunities: string[];
  risks: string[];
  discoveryQuestions: string[];
  // meta
  dataCoverage: string;
  createdAt: string;
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

interface AiReport {
  companyName?: string;
  tradeName?: string;
  legalName?: string;
  cnpj?: string;
  website?: string;
  linkedinUrl?: string;
  headquarters?: string;
  foundedYear?: string | number;
  employees?: string | number;
  employeeSource?: string;
  employeeUpdatedAt?: string;
  employeeConfidence?: string;
  industry?: string;
  companySize?: string;
  revenue?: string;
  products?: string[] | string;
  geographicPresence?: string;
  marketPositioning?: string;
  executiveSummary?: string;
  recentNews?: Array<{
    date?: string;
    fact?: string;
    source?: string;
    recencyScore?: number;
    relevance?: string;
  }>;

  generalBenefits?: Array<{ benefit?: string; source?: string }> | string[];
  educationalBenefits?: Array<{
    type?: string;
    detail?: string;
    source?: string;
  }>;
  consultedChannels?: Array<{ channel?: string; findings?: string }>;
  educationalMaturity?: { level?: string; justification?: string };
  recommendedApproach?: string[];
  attentionPoints?: string[];
  fit?: { score?: number; opportunities?: string[]; risks?: string[] };
  discoveryQuestions?: string[];
  dataCoverage?: string;
}

const NA = "Informação não localizada em fontes abertas";

const toArr = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(String).filter(Boolean) : v ? [String(v)] : [];
const toStr = (v: unknown, fb = NA): string => {
  if (v == null) return fb;
  if (Array.isArray(v)) return v.length ? v.join(", ") : fb;
  const s = String(v).trim();
  return s || fb;
};

function normalizeEduMaturity(raw?: string): EducationalMaturity {
  const v = (raw || "").toLowerCase();
  if (v.startsWith("avan")) return "Avançada";
  if (v.startsWith("inter")) return "Intermediária";
  if (v.startsWith("bás") || v.startsWith("bas")) return "Básica";
  return "Inexistente";
}

function cleanWebsite(w?: string): string {
  if (!w) return "";
  return w.replace(/^https?:\/\//i, "").replace(/\/$/, "");
}

function normalizeNews(
  list?: Array<{
    date?: string;
    fact?: string;
    source?: string;
    recencyScore?: number;
    relevance?: string;
  }>,
): NewsItem[] {
  if (!Array.isArray(list)) return [];
  return list
    .map((n) => ({
      date: (n.date || "").trim(),
      fact: (n.fact || "").trim(),
      source: (n.source || "").trim() || undefined,
      recencyScore: typeof n.recencyScore === "number" ? n.recencyScore : undefined,
      relevance: (n.relevance || "").trim() || undefined,
    }))
    .filter((n) => n.fact);
}

function normalizeBenefits(
  list?: Array<{ benefit?: string; source?: string }> | string[],
): BenefitItem[] {
  if (!Array.isArray(list)) return [];
  return list
    .map((b) =>
      typeof b === "string"
        ? { benefit: b.trim() }
        : { benefit: (b.benefit || "").trim(), source: (b.source || "").trim() || undefined },
    )
    .filter((b) => b.benefit);
}

function normalizeEduBenefits(
  list?: Array<{ type?: string; detail?: string; source?: string }>,
): EducationalBenefitItem[] {
  if (!Array.isArray(list)) return [];
  return list
    .map((b) => ({
      type: (b.type || "").trim(),
      detail: (b.detail || "").trim(),
      source: (b.source || "").trim() || undefined,
    }))
    .filter((b) => b.type || b.detail);
}

function normalizeChannels(
  list?: Array<{ channel?: string; findings?: string }>,
): ChannelFinding[] {
  if (!Array.isArray(list)) return [];
  return list
    .map((c) => ({
      channel: (c.channel || "").trim(),
      findings: (c.findings || "").trim(),
    }))
    .filter((c) => c.channel);
}

function fitFromMaturity(level: EducationalMaturity, aiScore?: number): number {
  if (typeof aiScore === "number" && aiScore >= 0 && aiScore <= 10) return +aiScore.toFixed(1);
  const map: Record<EducationalMaturity, number> = {
    Inexistente: 9,
    Básica: 8,
    Intermediária: 6,
    Avançada: 4,
  };
  return map[level];
}

export function mapAiToReport(
  ai: AiReport,
  fallbackName: string,
  id?: string | null,
  createdAt?: string | null,
): CompanyReport {
  const name = ai.tradeName?.trim() || ai.companyName?.trim() || fallbackName;
  const slug = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 20);
  const seed = hash(name.toLowerCase());
  const eduLevel = normalizeEduMaturity(ai.educationalMaturity?.level);
  const fitScore = fitFromMaturity(eduLevel, ai.fit?.score);

  return {
    id: id || `${slug}-${seed.toString(36)}`,
    name,
    tradeName: toStr(ai.tradeName, name),
    legalName: toStr(ai.legalName),
    cnpj: toStr(ai.cnpj),
    website: cleanWebsite(ai.website),
    linkedinUrl: toStr(ai.linkedinUrl, ""),
    segment: toStr(ai.industry),
    foundedYear: toStr(ai.foundedYear),
    headquarters: toStr(ai.headquarters),
    employees: toStr(ai.employees),
    employeeSource: ai.employeeSource?.trim() || undefined,
    employeeUpdatedAt: ai.employeeUpdatedAt?.trim() || undefined,
    employeeConfidence: ai.employeeConfidence?.trim() || undefined,

    size: toStr(ai.companySize),
    revenue: toStr(ai.revenue),
    products: toArr(ai.products),
    geographicPresence: toStr(ai.geographicPresence),
    marketPositioning: toStr(ai.marketPositioning),
    executiveSummary: toStr(ai.executiveSummary, "Resumo executivo não gerado."),
    recentNews: normalizeNews(ai.recentNews),
    generalBenefits: normalizeBenefits(ai.generalBenefits),
    educationalBenefits: normalizeEduBenefits(ai.educationalBenefits),
    consultedChannels: normalizeChannels(ai.consultedChannels),
    educationalMaturity: {
      level: eduLevel,
      justification: toStr(ai.educationalMaturity?.justification, "Justificativa não fornecida."),
    },
    fitScore: +fitScore.toFixed(1),
    recommendedApproach: toArr(ai.recommendedApproach),
    attentionPoints: toArr(ai.attentionPoints),
    opportunities: toArr(ai.fit?.opportunities),
    risks: toArr(ai.fit?.risks),
    discoveryQuestions: toArr(ai.discoveryQuestions),
    dataCoverage: toStr(ai.dataCoverage, "Fontes abertas, últimos 24 meses para notícias."),
    createdAt: createdAt || new Date().toISOString(),
  };
}

export { NA as NOT_FOUND_LABEL };

function normalizeCompanyKey(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(ltda|s\.?a\.?|me|eireli|mei|inc|group|grupo|holding)\b/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export { normalizeCompanyKey };
