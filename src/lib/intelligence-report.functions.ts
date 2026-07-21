import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
// removed: ai package
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { callClaude, type ClaudeWebSearchTool } from "./ai-gateway.server";
import { mapAiToReport, normalizeCompanyKey, type CompanyReport } from "./lummi-data";
import { checkRateLimit, rateLimitMessage } from "./rate-limit.server";

// Sentinela retornada ao usuário quando não conseguimos confirmar um CNPJ real
// (falha na busca ou dígito verificador inválido). Melhor um "não encontrado" honesto
// do que um número plausível mas errado indo pra call comercial.
const CNPJ_NOT_FOUND = "CNPJ não encontrado";

/**
 * Validação com dígito verificador conforme algoritmo oficial da Receita.
 * Usada para descartar CNPJs alucinados pelo modelo antes de persistir o relatório.
 */
export function isValidCnpj(raw: string): boolean {
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(digits)) return false;
  const nums = digits.split("").map(Number);
  const calc = (slice: number[], weights: number[]): number => {
    const sum = slice.reduce((acc, n, i) => acc + n * weights[i], 0);
    const mod = sum % 11;
    return mod < 2 ? 0 : 11 - mod;
  };
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  return calc(nums.slice(0, 12), w1) === nums[12] && calc(nums.slice(0, 13), w2) === nums[13];
}

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

[USO DA WEB SEARCH — OBRIGATÓRIO]
Você tem acesso à ferramenta web_search. Use-a ATIVAMENTE, não como último recurso. Triangule 3 pontos críticos:

A. NOTÍCIAS RECENTES — busque explicitamente por: fusões e aquisições, rodadas de investimento, expansão geográfica, contratações relevantes, mudanças de liderança (novo CEO, CFO, CHRO, CTO). Consulte pelo menos 2 buscas diferentes (nome da empresa + "notícias 2026", nome + "M&A OR liderança OR expansão").

B. CNPJ — busque ATIVAMENTE em fontes públicas confiáveis (Receita Federal, Casa dos Dados, Econodata, cnpj.biz). Não invente. Se cruzar duas fontes e os dígitos divergirem, considere não encontrado. Se não localizar em nenhuma fonte confiável, retorne EXATAMENTE a string "${CNPJ_NOT_FOUND}" no campo cnpj e registre em attentionPoints: "CNPJ não localizado em fontes públicas confiáveis — validar manualmente antes da call". O dígito verificador do CNPJ será validado automaticamente do lado do servidor: se você retornar um número inválido, ele será descartado.

C. LOCALIZAÇÃO DA SEDE — este é o ponto MAIS problemático historicamente. Consulte ao menos 3 fontes: (1) site oficial (rodapé, página "Contato"/"Sobre"), (2) cadastro CNPJ (endereço da matriz na Receita), (3) LinkedIn corporativo (campo "Sede"). Regras:
   - Se as 3 fontes concordarem, retorne a sede como string única no campo headquarters.
   - Se houver DIVERGÊNCIA entre fontes (endereços diferentes), NÃO escolha uma sozinho: liste todas inline no campo headquarters no formato "Cidade/Estado — Endereço [fonte]; Cidade/Estado — Endereço [outra fonte]" e adicione em attentionPoints: "Divergência de sede entre fontes públicas: [lista das fontes divergentes] — confirmar na call".
   - Se só uma fonte trouxer dado, registre a fonte inline: "Cidade/Estado (via site oficial)".

Priorize consumir buscas nos itens A, B e C. Para o resto do dossiê (posicionamento, produtos, cultura, benefícios), a web search é opcional — use se agregar valor real.

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
5. JAMAIS invente dados. Se algo não foi encontrado, retorne EXATAMENTE a string "Informação não localizada em fontes abertas" para campos string, [] para arrays e o valor "Inexistente" para maturidade educacional sem evidências. Para o CNPJ especificamente, use "${CNPJ_NOT_FOUND}" quando não localizado.
6. Não use dados não públicos. Sem juízos de valor. Apenas evidências.
7. Idioma: português do Brasil.

[LÓGICA INTERNA — não exiba os passos, apenas aplique]
1. Confirmação de identidade (CNPJ via web search em fontes públicas, razão social, nome fantasia, sede triangulada por múltiplas fontes, fundação).
2. Raio-X (faturamento estimado, funcionários com fonte/data/confiança, setor, produtos, presença geográfica, posicionamento).
3. Cultura e clima (Glassdoor, Indeed, LinkedIn, GPTW, ESG) com atenção a benefícios educacionais.
4. Momento atual (notícias recentes via web search, respeitando a regra de recência acima).
5. Síntese para abordagem consultiva.

[EXEMPLO DE REFERÊNCIA — DOSSIÊ IDEAL (empresa FICTÍCIA)]
A empresa abaixo é 100% FICTÍCIA e existe apenas como PADRÃO de qualidade e estrutura para você seguir. NÃO É a empresa a investigar. JAMAIS copie dados deste exemplo para o dossiê real. Se por acaso a empresa a investigar tiver nome parecido com "ACME Tech" ou "ACME Consultoria em Tecnologia Industrial Ltda", ignore completamente este exemplo e investigue via web search normalmente.

Note no exemplo como: cada afirmação vem com fonte; CNPJ vem acompanhado da razão social; campos ausentes usam "Informação não localizada em fontes abertas" em vez de invenção; attentionPoints sinaliza explicitamente divergências, gaps e riscos; discoveryQuestions são abertas e conectadas aos achados; recommendedApproach cita fatos reais encontrados no próprio dossiê.

Empresa do exemplo (FICTÍCIA): "ACME Tech — Plataformas de Automação Industrial"

Saída ideal:
{
  "companyName": "ACME Tech",
  "tradeName": "ACME Tech",
  "legalName": "ACME Consultoria em Tecnologia Industrial Ltda",
  "cnpj": "12.345.678/0001-90",
  "website": "acmetech.exemplo.com.br",
  "linkedinUrl": "https://www.linkedin.com/company/acmetech-exemplo",
  "headquarters": "Campinas/SP — Av. Exemplo Fictício, 1234, Cambuí (site oficial e cadastro CNPJ concordam)",
  "foundedYear": "Informação não localizada em fontes abertas",
  "employees": "51-200",
  "employeeSource": "LinkedIn corporativo",
  "employeeUpdatedAt": "Jul/2026",
  "employeeConfidence": "Média",
  "industry": "Automação Industrial e Manufatura Digital / Integração de Sistemas de Chão de Fábrica",
  "companySize": "Média",
  "revenue": "Informação não localizada em fontes abertas",
  "products": ["Plataforma de MES próprio", "Integradora de PLCs multi-fabricante", "Módulo de OEE em tempo real", "Consultoria em Indústria 4.0", "Retrofit de linhas industriais"],
  "geographicPresence": "Escritórios em Campinas (matriz) e Belo Horizonte. Atendimento declarado em plantas industriais no Brasil, Paraguai e Chile.",
  "marketPositioning": "Integradora média focada em manufatura discreta e processos contínuos, com abordagem consultiva e parcerias declaradas com fabricantes de PLCs. Comunica redução média de 18% em paradas não planejadas nos cases publicados. Diferencial declarado: stack próprio de coleta agnóstico ao fabricante do PLC.",
  "executiveSummary": "Integradora de automação industrial sediada em Campinas com operação em três países latino-americanos e time de 51-200 pessoas. Nenhum benefício educacional formalizado foi identificado publicamente — o que abre um espaço amplo, sem concorrência interna, para posicionar o EduHub como diferencial de retenção de engenheiros de automação e desenvolvedores. Perfil técnico: engenheiros de controle e programadores de PLC/MES que valorizam certificação e desenvolvimento contínuo.",
  "recentNews": [],
  "generalBenefits": [],
  "educationalBenefits": [],
  "consultedChannels": [
    { "channel": "Site oficial", "findings": "Sem seção de carreiras ou benefícios ao colaborador. Conteúdo voltado a marketing B2B de soluções." },
    { "channel": "LinkedIn corporativo", "findings": "Sem menção a benefícios educacionais. ~2K seguidores." },
    { "channel": "Glassdoor", "findings": "Sem avaliações relevantes localizadas." },
    { "channel": "Notícias", "findings": "Sem cobertura recente localizada em fontes públicas." }
  ],
  "educationalMaturity": {
    "level": "Inexistente",
    "justification": "Não foram localizadas evidências públicas de benefícios educacionais (auxílio-estudo, bolsas, convênio com universidades, plataforma de e-learning) no site institucional ou no LinkedIn da ACME Tech. O conteúdo público é B2B, sem seção de carreiras/cultura interna."
  },
  "fit": {
    "score": 9,
    "opportunities": [
      "Ausência total de programa educacional formalizado = espaço de entrada sem concorrência interna.",
      "Perfil de integradora industrial tende a valorizar certificação técnica (fabricantes de PLC/SCADA) como benefício de retenção.",
      "Operação multi-país favorece adoção de plataforma digital sem necessidade de estrutura física em cada praça."
    ],
    "risks": [
      "Estrutura de RH/People não identificada publicamente — não está claro quem é o decisor.",
      "Integradora B2B pode priorizar investimento em ferramental e certificação de fabricantes sobre benefícios educacionais amplos.",
      "Baixo volume de dados públicos sobre cultura interna real — risco de premissas incorretas na abordagem."
    ]
  },
  "recommendedApproach": [
    "Conectar a proposta ao perfil dos profissionais da ACME Tech: engenheiros de automação e desenvolvedores de MES/SCADA — perfil que valoriza certificação técnica e desenvolvimento contínuo.",
    "Usar a operação multi-país (Brasil, Paraguai, Chile) como gancho: o benefício de elegibilidade familiar do EduHub pode ser diferencial para empresas com equipes distribuídas em plantas industriais.",
    "Como não há benefício educacional identificado, posicionar o EduHub como algo inédito e sem concorrente interno a ser deslocado — abertura total no espaço."
  ],
  "attentionPoints": [
    "CNPJ do exemplo é fictício — em dossiê real, sempre confirmar via Receita Federal antes da reunião.",
    "Sem notícias relevantes encontradas nos últimos 12 meses em fontes abertas.",
    "Estrutura de RH/People não identificada publicamente — verificar no LinkedIn quem ocupa esse papel antes da call.",
    "Faturamento e data exata de fundação não localizados em nenhuma fonte pública.",
    "Não há certificação GPTW ou similar identificada."
  ],
  "discoveryQuestions": [
    "Hoje, quando um engenheiro da ACME Tech quer se desenvolver — seja tirar uma certificação de fabricante, fazer uma pós ou aprender um novo idioma — como a empresa apoia isso formalmente?",
    "Com a atuação em plantas em três países, como vocês pensam em benefícios que façam sentido pra times de campo distribuídos?",
    "Existe alguma iniciativa de capacitação técnica ou educacional que vocês gostariam de estruturar mas ainda não tiveram tempo ou recurso?"
  ],
  "dataCoverage": "Fontes consultadas: site institucional, LinkedIn corporativo, Glassdoor. Período: últimos 12 meses para notícias, snapshot atual para dados estruturais. Baixo volume de dados públicos sobre cultura interna — abordagem exige descoberta ativa na call."
}
[FIM DO EXEMPLO]

[FORMATO DE SAÍDA — OBRIGATÓRIO]
Retorne APENAS um JSON válido, sem markdown, sem blocos de código, sem texto fora do JSON. Estrutura exata:

{
  "companyName": "nome principal encontrado",
  "tradeName": "nome fantasia",
  "legalName": "razão social",
  "cnpj": "CNPJ formatado (00.000.000/0000-00) ou '${CNPJ_NOT_FOUND}' se não localizado em fontes públicas confiáveis",
  "website": "domínio sem https://",
  "linkedinUrl": "URL completa do LinkedIn corporativo",
  "headquarters": "Cidade/Estado da sede — com fonte inline; se divergência entre fontes, liste todas",
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
  "attentionPoints": ["lacunas de informação, avisos de recência de notícias, divergências entre fontes, riscos ou tópicos sensíveis a evitar"],
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

// Web search da Anthropic. max_uses alto para permitir triangulação nos 3 pontos críticos
// (notícias, CNPJ, sede) mais uma sobra para consultas laterais durante o dossiê.
const INTELLIGENCE_WEB_SEARCH_TOOL: ClaudeWebSearchTool = {
  type: "web_search_20250305",
  name: "web_search",
  max_uses: 12,
};

// Buffer para triangulação: prompt já passa dos 10k chars, e a resposta com múltiplas
// notícias detalhadas ultrapassa fácil os 8k tokens padrão. Sonnet 4.6 aguenta bem mais.
const INTELLIGENCE_MAX_TOKENS = 16000;

// Web search dispara múltiplas buscas HTTP dentro do turno — ampliar timeout para acomodar.
const INTELLIGENCE_TIMEOUT_MS = 240_000;

async function callClaudeWithRetry(prompt: string): Promise<string> {
  const text = await callClaude({
    prompt,
    temperature: 0.1,
    tools: [INTELLIGENCE_WEB_SEARCH_TOOL],
    maxTokens: INTELLIGENCE_MAX_TOKENS,
    timeoutMs: INTELLIGENCE_TIMEOUT_MS,
  });
  if (!text?.trim()) throw new Error("Resposta vazia da IA");
  return text;
}

/**
 * Descarta CNPJ inválido gerado pelo modelo. Se o dígito verificador não bater, substitui
 * pela sentinela ${CNPJ_NOT_FOUND} e adiciona um attentionPoint. Isso protege contra
 * alucinação mesmo com web search ativa — o modelo pode ler o CNPJ certo mas trocar um dígito.
 */
function enforceCnpjIntegrity(report: Record<string, unknown>): void {
  const raw = typeof report.cnpj === "string" ? report.cnpj.trim() : "";
  if (!raw) return;
  const digits = raw.replace(/\D/g, "");
  // "CNPJ não encontrado" ou variantes de "não localizado" — deixa como está.
  if (digits.length === 0) return;
  if (isValidCnpj(raw)) return;
  report.cnpj = CNPJ_NOT_FOUND;
  const currentPoints = Array.isArray(report.attentionPoints)
    ? (report.attentionPoints as unknown[]).map((p) => String(p))
    : [];
  currentPoints.push(
    `CNPJ retornado pela IA falhou na validação de dígito verificador (${raw}) — campo zerado automaticamente. Confirmar manualmente na Receita Federal.`,
  );
  report.attentionPoints = currentPoints;
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

    // Rate limit só quando vai chamar Claude (cache-hit acima não conta).
    // 10 dossiês/hora por usuário: prompt gigante + fetch caro.
    const rl = checkRateLimit(userId, "intelligence_report", 10, 60 * 60_000);
    if (!rl.ok) {
      throw new Error(rateLimitMessage(rl, "geração de dossiê"));
    }

    let content: string;
    try {
      content = await callClaudeWithRetry(PROMPT_TEMPLATE(data.companyName));
    } catch (err) {
      const msg = (err as Error).message ?? String(err);
      const friendly = /429|529|rate|quota|overloaded/i.test(msg)
        ? "Limite de requisições do Claude atingido. Tente novamente em instantes."
        : /API key|api.?key|ausente|invalid|401|403|authentication/i.test(msg)
          ? "Chave do Claude inválida ou ausente. Verifique ANTHROPIC_API_KEY no .env."
          : `Falha ao contatar o Claude: ${msg}`;
      throw new Error(friendly);
    }

    let rawReport: Json;
    try {
      rawReport = extractJson(content) as Json;
    } catch (err) {
      throw new Error(`JSON inválido retornado pelo Claude: ${(err as Error).message}`);
    }
    validateReport(rawReport);
    enforceCnpjIntegrity(rawReport);

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
