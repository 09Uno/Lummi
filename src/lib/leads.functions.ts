import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createHash } from "crypto";
// AI backend: Anthropic Claude via REST (ver src/lib/ai-gateway.server.ts).
import { getClaudeApiKey, callClaude } from "./ai-gateway.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { enrichLeadFree, extractCnpjsFromText, scrapeSite } from "./enrichment";
import { freeCompanySearch, freeHitsToRawText } from "./free-search";
import { checkRateLimit, rateLimitMessage } from "./rate-limit.server";

const CACHE_TTL_DAYS = Number(process.env.CACHE_TTL_DAYS ?? "1");
const CACHE_TTL_MS = Math.max(1, CACHE_TTL_DAYS) * 24 * 60 * 60 * 1000;

class SeededRandom {
  private seed: number;
  constructor(seed: number) {
    this.seed = seed || 1;
  }
  call(): number {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }
}

const InputSchema = z.object({
  macroSetor: z.string().min(1),
  microSetor: z.string().min(1),
  porte: z.string().min(1),
  estados: z.array(z.string()).min(1).max(3),
  quantidade: z.number().int().min(1).max(50),
  oQueVende: z.string().min(1),
  diferencial: z.string().optional().default(""),
  infoExtra: z.string().optional().default(""),
  exploracaoModo: z.enum(["validados", "novo", "agressivo"]).optional().default("validados"),
  skipCache: z.boolean().optional().default(false),
});

const LeadSchema = z.object({
  empresa: z.string(),
  uf: z.string(),
  segmento: z.string(),
  fit: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  linkedin: z.string().nullable().optional(),
  cnpj: z.string().nullable().optional(),
  concorrente_suspeito: z.boolean().nullable().optional(),
});

export type EnrichedLead = {
  empresa: string;
  uf: string;
  segmento: string;
  fit: string | null;
  website: string | null;
  linkedin: string | null;
  site_confirmado: boolean;
  concorrente_suspeito: boolean;
  confianca: "alta" | "media" | "validar";
  status_leed: "verificado" | "nao_verificado";
  // Free enrichment (scraping cheerio + OpenCNPJ / MinhaReceita / BrasilAPI)
  cnpj: string | null;
  razao_social: string | null;
  nome_fantasia: string | null;
  cnae: string | null;
  cnae_descricao: string | null;
  porte_oficial: string | null;
  situacao: string | null;
  municipio: string | null;
  capital_social: string | null;
  fonte_enriquecimento: string | null;
  emails: string[];
  telefones: string[];
  produtos: string[];
  servicos: string[];
  resumo_site: string;
};

function normalizeName(n: string) {
  return n
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(ltda|s\.?a\.?|me|eireli|mei|inc|group|grupo|holding)\b/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function hashFilters(f: {
  macroSetor: string;
  microSetor: string;
  porte: string;
  estados: string[];
  quantidade: number;
}) {
  const key = [
    f.macroSetor,
    f.microSetor,
    f.porte,
    [...f.estados].sort().join("|"),
    f.quantidade,
  ].join("::");
  return key;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function curateWithClaude(prompt: string): Promise<string> {
  return callClaude({ prompt, temperature: 0.5 });
}

function shufflePartially<T>(items: T[], shuffleRatio = 0.3, seed?: string): T[] {
  if (items.length < 5) return items;
  const shuffleCount = Math.ceil(items.length * shuffleRatio);
  const keepCount = items.length - shuffleCount;
  const keep = items.slice(0, keepCount);
  const toShuffle = items.slice(keepCount);
  const seedStr = seed || new Date().toISOString().split("T")[0];
  const hashSeed = parseInt(createHash("md5").update(seedStr).digest("hex").slice(0, 8), 16);
  const rng = new SeededRandom(hashSeed);
  const shuffled = toShuffle
    .map((item) => ({ item, sort: rng.call() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ item }) => item);
  return [...keep, ...shuffled];
}

/** Structured response — NEVER throws to the client. */
export type GenerateLeadsResponse = {
  ok: boolean;
  leads: EnrichedLead[];
  cached: boolean;
  error?: string;
  stage?: string;
  timings?: Record<string, number>;
  randomized?: boolean;
};

function log(stage: string, payload: Record<string, unknown> = {}) {
  try {
    console.log(`[generateLeads] ${stage} ${JSON.stringify(payload)}`);
  } catch {
    console.log(`[generateLeads] ${stage}`);
  }
}

async function step<T>(
  name: string,
  timings: Record<string, number>,
  fn: () => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  const started = Date.now();
  log(`start:${name}`);
  try {
    const value = await fn();
    const ms = Date.now() - started;
    timings[name] = ms;
    log(`end:${name}`, { ms });
    return { ok: true, value };
  } catch (err) {
    const ms = Date.now() - started;
    timings[name] = ms;
    const error = err instanceof Error ? `${err.message}\n${err.stack ?? ""}` : String(err);
    log(`error:${name}`, { ms, error });
    return { ok: false, error };
  }
}

export const generateLeads = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data, context }): Promise<GenerateLeadsResponse> => {
    const timings: Record<string, number> = {};
    const t0 = Date.now();
    log("begin", { userId: context.userId, quantidade: data.quantidade });

    try {
      // Ensures Claude is configured early with a clear error
      const keyStep = await step("check_claude_key", timings, async () => {
        getClaudeApiKey();
        return true;
      });
      if (!keyStep.ok) {
        return {
          ok: false,
          leads: [],
          cached: false,
          stage: "check_claude_key",
          error: keyStep.error,
          timings,
        };
      }

      const { supabase, userId } = context;

      const estadosLabel = data.estados.includes("Brasil Todo")
        ? "Brasil"
        : data.estados.join(", ");

      const filtersHash = hashFilters({
        macroSetor: data.macroSetor,
        microSetor: data.microSetor,
        porte: data.porte,
        estados: data.estados,
        quantidade: data.quantidade,
      });

      // ============= 1) CACHE =============
      if (!data.skipCache) {
        const cacheStep = await step("cache_lookup", timings, async () => {
          const ttlSince = new Date(Date.now() - CACHE_TTL_MS).toISOString();
          const { data: cacheHit, error } = await supabase
            .from("lead_search_cache")
            .select("results")
            .eq("user_id", userId)
            .eq("filters_hash", filtersHash)
            .gte("created_at", ttlSince)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (error) throw new Error(`supabase cache: ${error.message}`);
          return cacheHit?.results ? (cacheHit.results as EnrichedLead[]) : null;
        });
        if (cacheStep.ok && cacheStep.value) {
          log("cache_hit", { count: cacheStep.value.length });
          return { ok: true, leads: cacheStep.value, cached: true, timings };
        }
      } else {
        log("cache_skipped_by_user", { reason: "skipCache=true" });
      }

      // Rate limit só quando cache não pega — vai chamar Claude + scraping em N sites.
      // 20 gerações/hora por usuário. Cache-hit não consome.
      const rl = checkRateLimit(userId, "generate_leads", 20, 60 * 60_000);
      if (!rl.ok) {
        return {
          ok: false,
          leads: [],
          cached: false,
          stage: "rate_limit",
          error: rateLimitMessage(rl, "geração de leads"),
          timings,
        };
      }

      // ============= 2) HISTÓRICO / FEEDBACK =============
      type HistoryRow = { empresa: string; empresa_norm: string };
      type FeedbackRow = { empresa: string; empresa_norm: string; rating: string };
      let history: HistoryRow[] = [];
      let feedback: FeedbackRow[] = [];
      const histStep = await step("history_feedback", timings, async () => {
        const [h, f] = await Promise.all([
          supabase
            .from("lead_history")
            .select("empresa,empresa_norm")
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(80),
          supabase
            .from("lead_feedback")
            .select("empresa,empresa_norm,rating")
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(100),
        ]);
        return {
          history: (h.data ?? []) as HistoryRow[],
          feedback: (f.data ?? []) as FeedbackRow[],
        };
      });
      if (histStep.ok) {
        history = histStep.value.history;
        feedback = histStep.value.feedback;
      } // não-crítico — segue com listas vazias

      const historyLimit =
        data.exploracaoModo === "agressivo" ? 0 : data.exploracaoModo === "novo" ? 15 : 45;
      const alreadyDelivered = new Set(history.slice(0, historyLimit).map((h) => h.empresa_norm));
      log("exploration_mode", { mode: data.exploracaoModo, history_size: historyLimit });
      const rejected = new Set(
        feedback.filter((f) => f.rating === "bad").map((f) => f.empresa_norm),
      );
      const approved = new Set(
        feedback.filter((f) => f.rating === "good").map((f) => f.empresa_norm),
      );
      const excludeList = [
        ...history.slice(0, 35).map((h) => h.empresa),
        ...feedback
          .filter((f) => f.rating === "bad")
          .slice(0, 25)
          .map((f) => f.empresa),
      ];
      const approvedList = feedback
        .filter((f) => f.rating === "good")
        .slice(0, 20)
        .map((f) => f.empresa);

      // ============= 3) BUSCA WEB =============
      const searchLimit = Math.min(40, Math.max(20, Math.ceil(data.quantidade * 2.5)));
      const query = `Empresas do setor ${data.microSetor} (${data.macroSetor}) em ${estadosLabel}, com ${data.porte}, que sejam potenciais COMPRADORAS de ${data.oQueVende}.`;
      const searchStep = await step("web_search", timings, async () => {
        const hits = await freeCompanySearch({
          microSetor: data.microSetor,
          macroSetor: data.macroSetor,
          estadosLabel,
          porte: data.porte,
          oQueVende: data.oQueVende,
          limit: searchLimit,
        });
        return hits;
      });
      const freeHits = searchStep.ok ? searchStep.value : [];
      log("search_result", { hits: freeHits.length });
      let rawText = freeHitsToRawText(freeHits);
      if (!rawText.trim()) rawText = `Nenhum resultado bruto para: ${query}`;
      rawText = `[motor_busca=free]\n\n${rawText}`;

      // ============= 4) CLAUDE =============
      const excludeBlock = excludeList.length
        ? `EMPRESAS JÁ ENTREGUES OU REJEITADAS (NUNCA repetir):\n${excludeList.join(", ")}`
        : "";
      const approvedBlock = approvedList.length
        ? `PADRÕES DE LEADS APROVADOS PELO USUÁRIO (use como referência de qualidade):\n${approvedList.join(", ")}`
        : "";

      const prompt = `Você é um analista de inteligência de mercado B2B. Encontre CLIENTES em potencial (ICP), não concorrentes.

## Contexto do vendedor (NÃO é o setor-alvo)
- Produto/Serviço que o usuário vende: "${data.oQueVende}"
- Diferencial: "${data.diferencial || "não informado"}"
- Regra Extra: "${data.infoExtra || "nenhuma"}"

## Setor-alvo (ICP)
- Macro: ${data.macroSetor}
- Micro: ${data.microSetor}
- Porte: ${data.porte}
- Local: ${estadosLabel}

## REGRAS
1. Nunca inclua concorrentes de "${data.oQueVende}". Se dúvida: "concorrente_suspeito": true.
2. Empresas devem pertencer ao setor-alvo (${data.microSetor}).
3. Campo "fit": sinal concreto ou fit razoável baseado no perfil (máx 25 palavras).
4. "website" e "linkedin": use URL exata do texto bruto ou domínio corporativo óbvio (https://).
5. Se aparecer CNPJ, preencha "cnpj".
6. ${excludeBlock || "Sem histórico prévio."}
7. ${approvedBlock || ""}

## Formato de resposta
Retorne APENAS JSON válido (sem markdown):
{"leads":[{"empresa":"...","uf":"...","segmento":"...","fit":"..."|null,"website":"https://..."|null,"linkedin":"https://linkedin.com/company/..."|null,"cnpj":"00000000000000"|null,"concorrente_suspeito":false}]}

Inclua entre ${Math.max(data.quantidade, Math.ceil(data.quantidade * 1.3))} e ${Math.min(50, Math.ceil(data.quantidade * 1.4))} objetos.

## Texto bruto
${rawText.slice(0, 16000)}`;

      const curateStep = await step("claude_curate", timings, async () => {
        const text = await curateWithClaude(prompt);
        let cleaned = text
          .replace(/^```json\s*/im, "")
          .replace(/^```\s*/im, "")
          .replace(/```\s*$/im, "")
          .trim();
        const start = cleaned.indexOf("{");
        const end = cleaned.lastIndexOf("}");
        if (start !== -1 && end > start) cleaned = cleaned.slice(start, end + 1);
        let parsed: unknown;
        try {
          parsed = JSON.parse(cleaned);
        } catch (e) {
          throw new Error(
            `JSON.parse falhou: ${e instanceof Error ? e.message : String(e)}. Prefixo: ${cleaned.slice(0, 200)}`,
          );
        }
        const validated = z.object({ leads: z.array(LeadSchema) }).parse(parsed);
        return validated.leads;
      });
      if (!curateStep.ok) {
        return {
          ok: false,
          leads: [],
          cached: false,
          stage: "claude_curate",
          error: curateStep.error,
          timings,
        };
      }
      const parsedLeads = curateStep.value;
      log("claude_result", { count: parsedLeads.length });

      // ============= 5) FILTRO =============
      const filtered = parsedLeads.filter((l) => {
        if (l.concorrente_suspeito) return false;
        const norm = normalizeName(l.empresa);
        if (!norm) return false;
        if (rejected.has(norm)) return false;
        if (alreadyDelivered.has(norm)) return false;
        return true;
      });
      log("filtered", { in: parsedLeads.length, out: filtered.length });

      // ============= 6) SCRAPING (prova de vida) =============
      const verifyCap = Math.min(
        filtered.length,
        Math.max(data.quantidade, Math.ceil(data.quantidade * 1.25)),
      );
      const toVerify = filtered.slice(0, verifyCap);
      const scrapeStep = await step("scrape_all", timings, async () => {
        return Promise.all(
          toVerify.map(async (l) => {
            if (!l.website) return { ok: false, linkedin: null, markdown: "" };
            try {
              const j = await scrapeSite(l.website, { company: l.empresa });
              return { ok: j.ok, linkedin: j.linkedin, markdown: j.markdown.slice(0, 4000) };
            } catch (e) {
              log("scrape_error", {
                empresa: l.empresa,
                error: e instanceof Error ? e.message : String(e),
              });
              return { ok: false, linkedin: null, markdown: "" };
            }
          }),
        );
      });
      const verifications = scrapeStep.ok
        ? scrapeStep.value
        : toVerify.map(() => ({ ok: false, linkedin: null, markdown: "" }));

      // ============= 7) ENRICHMENT (CNPJ + normalização) =============
      const enrichStep = await step("enrich_all", timings, async () => {
        return Promise.all(
          toVerify.map(async (l, i) => {
            const v = verifications[i];
            let site_confirmado = Boolean(l.website && v.ok);
            let linkedin = l.linkedin ?? v.linkedin ?? null;
            const fitOk = Boolean(l.fit && l.fit.trim().length > 0);

            const extraBits = [v.markdown, l.fit ?? "", l.empresa].join("\n");
            const cnpjFromPage = extractCnpjsFromText(extraBits);
            const cnpjHint = l.cnpj ?? cnpjFromPage[0] ?? null;

            let free;
            try {
              free = await enrichLeadFree({
                empresa: l.empresa,
                website: l.website ?? null,
                linkedin,
                site_confirmado,
                extraText: extraBits,
                cnpjHint,
              });
            } catch (err) {
              log("enrich_error", {
                empresa: l.empresa,
                error: err instanceof Error ? err.message : String(err),
              });
              free = {
                site_confirmado,
                linkedin,
                cnpj: null,
                razao_social: null,
                nome_fantasia: null,
                cnae: null,
                cnae_descricao: null,
                porte_oficial: null,
                situacao: null,
                municipio: null,
                capital_social: null,
                fonte_enriquecimento: null,
                emails: [],
                telefones: [],
                produtos: [],
                servicos: [],
                resumo_site: "",
              };
            }

            site_confirmado = free.site_confirmado;
            linkedin = free.linkedin;

            let confianca: EnrichedLead["confianca"] = "validar";
            if (site_confirmado && fitOk) confianca = "alta";
            else if (site_confirmado || fitOk) confianca = "media";
            if (free.cnpj && free.situacao && /ativa/i.test(free.situacao)) {
              confianca = site_confirmado || fitOk ? "alta" : "media";
            }
            const norm = normalizeName(l.empresa);
            if (approved.has(norm)) confianca = "alta";

            const lead: EnrichedLead = {
              empresa: l.empresa,
              uf: l.uf,
              segmento: l.segmento,
              fit: fitOk ? (l.fit as string) : null,
              website: l.website ?? null,
              linkedin,
              site_confirmado,
              concorrente_suspeito: Boolean(l.concorrente_suspeito),
              confianca,
              status_leed: site_confirmado ? "verificado" : "nao_verificado",
              cnpj: free.cnpj,
              razao_social: free.razao_social,
              nome_fantasia: free.nome_fantasia,
              cnae: free.cnae,
              cnae_descricao: free.cnae_descricao,
              porte_oficial: free.porte_oficial,
              situacao: free.situacao,
              municipio: free.municipio,
              capital_social: free.capital_social,
              fonte_enriquecimento: free.fonte_enriquecimento,
              emails: free.emails,
              telefones: free.telefones,
              produtos: free.produtos,
              servicos: free.servicos,
              resumo_site: free.resumo_site,
            };
            return lead;
          }),
        );
      });
      if (!enrichStep.ok) {
        return {
          ok: false,
          leads: [],
          cached: false,
          stage: "enrich_all",
          error: enrichStep.error,
          timings,
        };
      }
      const enrichedAll = enrichStep.value;

      // ============= 8) SCORE / RANKING =============
      const rank = (c: EnrichedLead["confianca"]) => (c === "alta" ? 0 : c === "media" ? 1 : 2);
      let enriched = [...enrichedAll].sort((a, b) => {
        if (a.site_confirmado !== b.site_confirmado) return a.site_confirmado ? -1 : 1;
        if (Boolean(a.cnpj) !== Boolean(b.cnpj)) return a.cnpj ? -1 : 1;
        return rank(a.confianca) - rank(b.confianca);
      });

      let randomized = false;
      if (data.exploracaoModo === "novo") {
        enriched = shufflePartially(enriched, 0.2, `${data.microSetor}:${data.oQueVende}`);
        randomized = true;
        log("randomization_applied", { mode: "novo", ratio: 0.2 });
      } else if (data.exploracaoModo === "agressivo") {
        enriched = shufflePartially(enriched, 0.4, `${data.microSetor}:${data.oQueVende}`);
        randomized = true;
        log("randomization_applied", { mode: "agressivo", ratio: 0.4 });
      }

      enriched = enriched.slice(0, data.quantidade);
      log("ranked", { count: enriched.length, randomized });

      // ============= 9) PERSISTÊNCIA =============
      if (enriched.length > 0) {
        const persistStep = await step("persist", timings, async () => {
          const { error: cacheErr } = await supabase.from("lead_search_cache").insert({
            user_id: userId,
            filters_hash: filtersHash,
            filters: {
              macroSetor: data.macroSetor,
              microSetor: data.microSetor,
              porte: data.porte,
              estados: data.estados,
              quantidade: data.quantidade,
            },
            results: enriched,
          });
          if (cacheErr) log("persist_cache_warn", { error: cacheErr.message });

          const historyRows = enriched.map((l) => ({
            user_id: userId,
            empresa: l.empresa,
            empresa_norm: normalizeName(l.empresa),
            uf: l.uf,
            segmento: l.segmento,
          }));
          const { error: histErr } = await supabase
            .from("lead_history")
            .upsert(historyRows, { onConflict: "user_id,empresa_norm" });
          if (histErr) log("persist_history_warn", { error: histErr.message });
          return true;
        });
        if (!persistStep.ok) {
          // persistência não deve derrubar o retorno — apenas logar
          log("persist_failed_non_fatal", { error: persistStep.error });
        }
      }

      timings.total = Date.now() - t0;
      log("done", { count: enriched.length, ms: timings.total });
      return { ok: true, leads: enriched, cached: false, timings, randomized };
    } catch (err) {
      // Blindagem final — nada deve escapar
      timings.total = Date.now() - t0;
      const error = err instanceof Error ? `${err.message}\n${err.stack ?? ""}` : String(err);
      log("unhandled", { error, timings });
      return { ok: false, leads: [], cached: false, stage: "unhandled", error, timings };
    }
  });

const FeedbackSchema = z.object({
  empresa: z.string().min(1),
  rating: z.enum(["good", "bad"]),
});

export const submitLeadFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => FeedbackSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const empresa_norm = normalizeName(data.empresa);
    if (!empresa_norm) throw new Error("Nome de empresa inválido");
    const { error } = await supabase.from("lead_feedback").upsert(
      {
        user_id: userId,
        empresa: data.empresa,
        empresa_norm,
        rating: data.rating,
      },
      { onConflict: "user_id,empresa_norm" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });
