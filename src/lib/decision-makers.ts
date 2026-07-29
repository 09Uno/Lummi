/**
 * Tomadores de decisão (TDs) — tipos, normalização, cache e concorrência.
 *
 * Usado tanto no fluxo de prospecção (antes do Kanban) quanto no
 * relatório de Inteligência Comercial. O contexto comercial
 * (oQueVende + diferencial + infoExtra) entra na chave de cache para
 * não reutilizar TDs gerados para outro produto.
 */

import { createHash } from "crypto";

export type LeadDecisionMaker = {
  name: string;
  title: string;
  /** Área compradora (texto livre normalizado) */
  area: string;
  /** 1 = maior prioridade (ordenar crescente) */
  priority: number;
  /** 0–100 (ordenar decrescente) */
  score: number;
  /** 0–1 probabilidade de ser decisor de compra */
  probabilidade_decisor: number | null;
  linkedinUrl: string | null;
  employment_verified: boolean;
  source: string | null;
  /** Evidência curta (ex.: "cargo atual no LinkedIn · 2025") */
  evidence: string | null;
};

const TD_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h

type TdCacheEntry = {
  makers: LeadDecisionMaker[];
  expiresAt: number;
};

/** Cache em memória do processo server — não persiste entre deploys. */
const tdMemoryCache = new Map<string, TdCacheEntry>();

export function commercialContextHash(
  oQueVende?: string | null,
  diferencial?: string | null,
  infoExtra?: string | null,
): string {
  const raw = [oQueVende ?? "", diferencial ?? "", infoExtra ?? ""]
    .map((s) => s.trim().toLowerCase())
    .join("|");
  return createHash("sha256").update(raw).digest("hex").slice(0, 16);
}

export function buildProductContext(
  oQueVende?: string | null,
  diferencial?: string | null,
  infoExtra?: string | null,
): string {
  return [oQueVende, diferencial, infoExtra]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join(" | ");
}

/** True apenas quando o produto/contexto comercial aponta explicitamente para RH/People/benefícios. */
export function productImpliesRh(productContext: string): boolean {
  const t = productContext
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (!t.trim()) return false;
  return (
    /\b(rh|recursos humanos|people|people experience|chro|beneficio|beneficios|vale[-\s]?refeicao|vale[-\s]?alimentacao|plano de saude|recrutamento|talent|onboarding|employer branding|clima organizacional|folha de pagamento)\b/.test(
      t,
    ) || /\b(beneficio educacional|auxilio[-\s]?estudo|universidade corporativa)\b/.test(t)
  );
}

export function normalizeCompanyKey(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(ltda|s\.?a\.?|me|eireli|mei|inc|group|grupo|holding)\b/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function tdCacheKey(companyName: string, contextHash: string): string {
  return `${normalizeCompanyKey(companyName)}::${contextHash || "none"}`;
}

export function getCachedDecisionMakers(
  companyName: string,
  contextHash: string,
): LeadDecisionMaker[] | null {
  const key = tdCacheKey(companyName, contextHash);
  const hit = tdMemoryCache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    tdMemoryCache.delete(key);
    return null;
  }
  return hit.makers;
}

export function setCachedDecisionMakers(
  companyName: string,
  contextHash: string,
  makers: LeadDecisionMaker[],
): void {
  const key = tdCacheKey(companyName, contextHash);
  tdMemoryCache.set(key, {
    makers,
    expiresAt: Date.now() + TD_CACHE_TTL_MS,
  });
}

function safeLinkedin(url: unknown): string | null {
  if (typeof url !== "string") return null;
  const u = url.trim();
  if (!u) return null;
  if (!/^https?:\/\/([a-z0-9-]+\.)?linkedin\.com\//i.test(u)) return null;
  // Descarta páginas genéricas de busca / company root sem slug útil
  if (/linkedin\.com\/(search|pub\/dir)/i.test(u)) return null;
  return u;
}

function looksTerminated(notes: string, title: string): boolean {
  const t = `${notes} ${title}`.toLowerCase();
  return /\b(ex[-\s]?|antigo|desligad|demitid|sa(i|iu) da empresa|left the company|formerly|no longer)\b/.test(
    t,
  );
}

/**
 * Normaliza, deduplica e ordena a lista bruta retornada pela IA.
 * - Descarta perfis com indício de desligamento
 * - Não inventa LinkedIn (só URLs válidas)
 * - Ordena por priority ASC, score DESC
 */
export function normalizeDecisionMakers(raw: unknown): LeadDecisionMaker[] {
  let list: unknown[] = [];
  if (Array.isArray(raw)) {
    list = raw;
  } else if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.decisionMakers)) list = obj.decisionMakers;
    else if (Array.isArray(obj.decision_makers)) list = obj.decision_makers;
  }

  const seen = new Set<string>();
  const out: LeadDecisionMaker[] = [];

  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const name = String(r.name ?? r.nome ?? "").trim();
    if (!name || name.length < 3) continue;

    const title = String(r.title ?? r.cargo ?? r.role ?? "").trim();
    const notes = String(r.notes ?? r.evidence ?? r.evidencia ?? "").trim();
    if (looksTerminated(notes, title)) continue;

    const area = String(r.area ?? r.departamento ?? "").trim() || "Não identificada";
    let priority = Number(r.priority ?? r.prioridade ?? 99);
    if (!Number.isFinite(priority) || priority < 1) priority = 99;
    priority = Math.min(99, Math.max(1, Math.round(priority)));

    let score = Number(r.score ?? r.score_influencia ?? 0);
    if (!Number.isFinite(score)) score = 0;
    // Aceita 0–1 ou 0–100
    if (score > 0 && score <= 1) score = Math.round(score * 100);
    score = Math.min(100, Math.max(0, Math.round(score)));

    let probabilidade: number | null = null;
    const pRaw = r.probabilidade_decisor ?? r.probability ?? r.probabilidade;
    if (pRaw != null && Number.isFinite(Number(pRaw))) {
      let p = Number(pRaw);
      if (p > 1) p = p / 100;
      probabilidade = Math.min(1, Math.max(0, p));
    }

    const linkedinUrl = safeLinkedin(r.linkedinUrl ?? r.linkedin_url ?? r.linkedin);
    const employment_verified = Boolean(
      r.employment_verified ?? r.emprego_verificado ?? linkedinUrl,
    );
    const source =
      typeof r.source === "string" && r.source.trim()
        ? r.source.trim()
        : linkedinUrl
          ? "linkedin"
          : typeof r.fonte === "string"
            ? r.fonte
            : null;
    const evidence =
      notes ||
      (typeof r.evidence === "string" ? r.evidence.trim() : null) ||
      (typeof r.evidencia === "string" ? r.evidencia.trim() : null) ||
      null;

    const dedupeKey = `${name.toLowerCase()}|${title.toLowerCase()}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    out.push({
      name,
      title: title || "Cargo não informado",
      area,
      priority,
      score,
      probabilidade_decisor: probabilidade,
      linkedinUrl,
      employment_verified,
      source,
      evidence,
    });
  }

  out.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return b.score - a.score;
  });

  return out.slice(0, 12);
}

/** Extrai JSON de resposta (markdown fence ou texto puro). */
export function extractJsonLoose(raw: string): unknown {
  const trimmed = raw.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fence ? fence[1].trim() : trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return JSON.parse(candidate.slice(start, end + 1));
  }
  const aStart = candidate.indexOf("[");
  const aEnd = candidate.lastIndexOf("]");
  if (aStart >= 0 && aEnd > aStart) {
    return JSON.parse(candidate.slice(aStart, aEnd + 1));
  }
  return JSON.parse(candidate);
}

/**
 * Pool com concorrência limitada — evita disparar dezenas de people_search
 * simultâneos (rate-limit / custo).
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const limit = Math.max(1, Math.min(concurrency, items.length || 1));
  const results: R[] = new Array(items.length);
  let next = 0;

  async function worker() {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }

  await Promise.all(Array.from({ length: limit }, () => worker()));
  return results;
}
