import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
// removed: ai package
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callGemini } from "./ai-gateway.server";
import { mapAiToReport, normalizeCompanyKey, type CompanyReport } from "./lummi-data";
import { checkRateLimit, rateLimitMessage } from "./rate-limit.server";

const Input = z.object({ companyName: z.string().min(1).max(200) });
const ByIdInput = z.object({ id: z.string().uuid() });
const ToggleFavoriteInput = z.object({ id: z.string().uuid(), isFavorite: z.boolean() });

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

const PROMPT_TEMPLATE = (companyName: string) => {
  const today = new Date();
  const dateStr = today.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  return `[PERSONA]
Atue como um Investigador Sênior de Inteligência Competitiva e Business Intelligence, com 20 anos de experiência em due diligence corporativa e prospecção B2B. Você é meticuloso, cético e obcecado por fontes verificáveis. Tom analítico, direto e profissional, como um consultor preparando um dossiê para um CEO antes de uma reunião decisiva.

[DATA DE REFERÊNCIA]
Hoje é ${dateStr}. Use esta data como âncora para julgar recência de notícias e defasagem de dados.

[CONTEXTO]
Produza um dossiê completo e confiável sobre a empresa abaixo para preparação de uma ligação/reunião comercial. Um ponto central é descobrir se a empresa possui cultura consolidada de concessão de benefícios aos colaboradores, com foco especial em benefícios educacionais (auxílio-estudo, bolsas, universidade corporativa, convênios com instituições de ensino, plataformas de e-learning, programas de idiomas).

[EMPRESA A INVESTIGAR]
${companyName}

[RESTRIÇÕES E REGRAS]
1. Validação obrigatória antes de afirmar qualquer coisa. Dados estruturais (fundação, missão) podem ser mais antigos.

2. RECÊNCIA DE NOTÍCIAS (regra flexível — priorize trazer notícias sempre que existirem):
   a) PREFERÊNCIA: notícias dos últimos 90 dias (recencyScore 90-100 para ≤30d, 80 para 31-60d, 70 para 61-90d).
   b) Se não houver nada nos últimos 90 dias, TRAGA notícias dos últimos 180 dias (recencyScore 55) e sinalize em attentionPoints: "Notícias mais recentes datam de [MÊS/ANO]".
   c) Se não houver nada nos últimos 180 dias, aceite os últimos 365 dias (recencyScore 40) com o mesmo aviso em attentionPoints.
   d) Só retorne recentNews = [] se realmente não houver notícia relevante em 12 meses; nesse caso registre em attentionPoints: "Sem notícias relevantes encontradas nos últimos 12 meses em fontes abertas".
   e) NÃO exija data exata do dia — mês/ano é suficiente. Evite apenas notícias claramente especulativas ou sem fonte identificável.
   f) Traga de 3 a 8 notícias quando existirem. Priorize: Regulações > Investimentos/M&A > Expansões > Lançamentos > Reconhecimentos/Prêmios > Movimentações executivas.
   g) Fontes aceitas incluem: Valor Econômico, Brazil Journal, Exame, Estadão, Folha, InfoMoney, NeoFeed, Pipeline, Startups, Bloomberg Línea, Reuters, releases oficiais, LinkedIn corporativo, sites setoriais e a própria sala de imprensa da empresa.

3. CONTAGEM DE FUNCIONÁRIOS (hierarquia obrigatória):
   - Tier 1 (Confidence: Alta): LinkedIn oficial (Sobre), site de carreiras, release/balanço oficial, RAIS/e-Social.
   - Tier 2 (Confidence: Média): Glassdoor, Indeed, Great Place to Work — use INTERVALO (ex: "1.500-2.000").
   - Tier 3 (Confidence: Baixa): menção em notícia recente, estimativa por volume de vagas no LinkedIn.
   - Se não encontrar em fonte alguma: employees = "Não localizado em fontes abertas" e employeeConfidence = "Não disponível".
   - Nunca invente número. Sempre preencha employeeSource, employeeUpdatedAt e employeeConfidence.
   - Em caso de conflito entre fontes, reporte de forma explícita (ex: "500+ (LinkedIn) — Glassdoor sugere ~200-300 na operação SP").

4. Use apenas fontes primárias ou de alta credibilidade: site oficial, LinkedIn corporativo, releases, Glassdoor, Great Place to Work, Valor Econômico, Brazil Journal, Exame, Receita Federal.
5. JAMAIS invente dados. Se algo não foi encontrado, retorne EXATAMENTE a string "Informação não localizada em fontes abertas" para campos string, [] para arrays e o valor "Inexistente" para maturidade educacional sem evidências.
6. Não use dados não públicos. Sem juízos de valor. Apenas evidências.
7. Idioma: português do Brasil.

[LÓGICA INTERNA — não exiba os passos, apenas aplique]
1. Confirmação de identidade (CNPJ, razão social, nome fantasia, sede, fundação).
2. Raio-X (faturamento estimado, funcionários com fonte/data/confiança, setor, produtos, presença geográfica, posicionamento).
3. Cultura e clima (Glassdoor, Indeed, LinkedIn, GPTW, ESG) com atenção a benefícios educacionais.
4. Momento atual (notícias respeitando a regra de recência acima).
5. Síntese para abordagem consultiva.

[FORMATO DE SAÍDA — OBRIGATÓRIO]
Retorne APENAS um JSON válido, sem markdown, sem blocos de código, sem texto fora do JSON. Estrutura exata:

{
  "companyName": "nome principal encontrado",
  "tradeName": "nome fantasia",
  "legalName": "razão social",
  "cnpj": "CNPJ formatado ou vazio se não encontrado",
  "website": "domínio sem https://",
  "linkedinUrl": "URL completa do LinkedIn corporativo",
  "headquarters": "Cidade/Estado da sede",
  "foundedYear": "ano de fundação como string",
  "employees": "número ou intervalo (ex: '2.500' ou '1.500-2.000')",
  "employeeSource": "LinkedIn | Glassdoor | Balanço 2025 | Site de carreiras | etc.",
  "employeeUpdatedAt": "Mês/Ano da última verificação",
  "employeeConfidence": "Alta | Média | Baixa | Não disponível",
  "industry": "segmento/indústria",
  "companySize": "Pequena | Média | Grande | Enterprise",
  "revenue": "faturamento aproximado com fonte e ano (ex: 'R$ 6,5 bi em 2024 — Valor Econômico')",
  "products": ["principais produtos/serviços"],
  "geographicPresence": "presença geográfica detalhada",
  "marketPositioning": "posicionamento de mercado e concorrentes diretos",
  "executiveSummary": "parágrafo único de até 5 linhas resumindo quem são, porte, principal oportunidade e uma dica de abordagem baseada em evidências",
  "recentNews": [
    { "date": "MMM/AAAA", "fact": "fato objetivo com data exata", "source": "veículo", "recencyScore": 100, "relevance": "Alto | Médio | Baixo" }
  ],
  "generalBenefits": [
    { "benefit": "benefício específico", "source": "Glassdoor | LinkedIn | site oficial | etc." }
  ],
  "educationalBenefits": [
    { "type": "Auxílio-estudo | Bolsas | Universidade corporativa | Convênio | Idiomas | E-learning", "detail": "descrição objetiva", "source": "fonte" }
  ],
  "consultedChannels": [
    { "channel": "Glassdoor | LinkedIn | Site de carreiras | GPTW | Notícias", "findings": "o que foi encontrado ou 'sem menção a benefícios educacionais'" }
  ],
  "educationalMaturity": {
    "level": "Inexistente | Básica | Intermediária | Avançada",
    "justification": "2-3 frases justificando com base nos achados reais"
  },
  "fit": {
    "score": "inteiro de 0 a 10 — quanto MAIOR a oportunidade para vender benefício educacional (maturidade baixa = score alto)",
    "opportunities": ["3-5 oportunidades baseadas nos achados"],
    "risks": ["3-5 riscos/objeções potenciais baseados nos achados"]
  },
  "recommendedApproach": ["2-3 pontos de conexão para a abordagem, citando fatos reais encontrados"],
  "attentionPoints": ["lacunas de informação, avisos de recência de notícias, riscos ou tópicos sensíveis a evitar"],
  "discoveryQuestions": ["3-4 perguntas abertas para call de descoberta sobre desenvolvimento e benefícios"],
  "dataCoverage": "resumo da abrangência temporal e tipos de fonte consultadas"
}`;
};

function extractJson(raw: string): unknown {
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(cleaned.slice(start, end + 1));
    }
    throw new Error("AI response is not valid JSON");
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function callGeminiWithRetry(prompt: string): Promise<string> {
  const text = await callGemini({ prompt, temperature: 0.1 });
  if (!text?.trim()) throw new Error("Resposta vazia da IA");
  return text;
}

function validateReport(report: unknown): asserts report is Record<string, unknown> {
  if (!report || typeof report !== "object") {
    throw new Error("Relatório incompleto gerado pela IA. Tente novamente.");
  }
  const r = report as Record<string, unknown>;
  const required = [
    "companyName",
    "executiveSummary",
    "educationalMaturity",
    "fit",
    "discoveryQuestions",
    "recommendedApproach",
  ];
  for (const key of required) {
    if (r[key] === undefined || r[key] === null) {
      throw new Error("Relatório incompleto gerado pela IA. Tente novamente.");
    }
  }
}

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

const GenerateInput = z.object({
  companyName: z.string().min(1).max(200),
  sourceLeadEmpresa: z.string().optional(),
});

export const generateIntelligenceReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => GenerateInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const key = normalizeCompanyKey(data.companyName) || data.companyName.toLowerCase();
    const sinceIso = new Date(Date.now() - SIX_HOURS_MS).toISOString();

    // Reaproveita relatório recente do próprio usuário (6h)
    const { data: recent } = await supabase
      .from("intelligence_reports")
      .select("id, company_name, report, created_at")
      .eq("user_id", userId)
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(20);
    const hit = (recent ?? []).find((r) => normalizeCompanyKey(r.company_name) === key);
    if (hit) {
      const mapped = mapAiToReport(
        hit.report as Record<string, unknown>,
        data.companyName,
        hit.id,
        hit.created_at,
      );
      return { report: mapped, id: hit.id, createdAt: hit.created_at, cached: true };
    }

    // Rate limit só quando vai chamar Gemini (cache-hit acima não conta).
    // 10 dossiês/hora por usuário: prompt gigante + fetch caro.
    const rl = checkRateLimit(userId, "intelligence_report", 10, 60 * 60_000);
    if (!rl.ok) {
      throw new Error(rateLimitMessage(rl, "geração de dossiê"));
    }

    let content: string;
    try {
      content = await callGeminiWithRetry(PROMPT_TEMPLATE(data.companyName));
    } catch (err) {
      const msg = (err as Error).message ?? String(err);
      const friendly = /429|rate|quota|RESOURCE_EXHAUSTED/i.test(msg)
        ? "Limite de requisições do Gemini atingido. Tente novamente em instantes."
        : /API key|API_KEY|ausente|invalid|403|PERMISSION/i.test(msg)
          ? "Chave do Gemini inválida ou ausente. Verifique GEMINI_API_KEY no .env."
          : `Falha ao contatar o Gemini: ${msg}`;
      throw new Error(friendly);
    }

    let rawReport: Json;
    try {
      rawReport = extractJson(content) as Json;
    } catch (err) {
      throw new Error(`JSON inválido retornado pelo Gemini: ${(err as Error).message}`);
    }
    validateReport(rawReport);

    const { data: inserted, error } = await supabase
      .from("intelligence_reports")
      .insert({
        user_id: userId,
        company_name: data.companyName,
        report: rawReport as never,
        source_lead_empresa: data.sourceLeadEmpresa ?? null,
      })
      .select("id, created_at")
      .single();
    if (error) throw new Error(`Falha ao salvar relatório: ${error.message}`);

    const mapped = mapAiToReport(
      rawReport as Record<string, unknown>,
      data.companyName,
      inserted.id,
      inserted.created_at,
    );
    return { report: mapped, id: inserted.id, createdAt: inserted.created_at, cached: false };
  });

export const listIntelligenceReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("intelligence_reports")
      .select("id, company_name, is_favorite, created_at, source_lead_empresa")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return { items: data ?? [] };
  });

export const getIntelligenceReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ByIdInput.parse(data))
  .handler(
    async ({
      data,
      context,
    }): Promise<{ report: CompanyReport; id: string; createdAt: string; isFavorite: boolean }> => {
      const { supabase, userId } = context;
      const { data: row, error } = await supabase
        .from("intelligence_reports")
        .select("id, company_name, report, created_at, is_favorite")
        .eq("user_id", userId)
        .eq("id", data.id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!row) throw new Error("Relatório não encontrado");
      const mapped = mapAiToReport(
        row.report as Record<string, unknown>,
        row.company_name,
        row.id,
        row.created_at,
      );
      return { report: mapped, id: row.id, createdAt: row.created_at, isFavorite: row.is_favorite };
    },
  );

export const toggleIntelligenceFavorite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ToggleFavoriteInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("intelligence_reports")
      .update({ is_favorite: data.isFavorite })
      .eq("user_id", userId)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
