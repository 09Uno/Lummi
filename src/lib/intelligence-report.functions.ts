import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
// removed: ai package
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  callPerplexityAgent,
  getPerplexityModelLeads,
  getPerplexityModelDossie,
  getPerplexityModelDecisores,
} from "./ai-gateway.server";
import { mapAiToReport, normalizeCompanyKey, type CompanyReport } from "./lummi-data";
import { checkRateLimit, rateLimitMessage } from "./rate-limit.server";
import {
  buildProductContext,
  commercialContextHash,
  extractJsonLoose,
  getCachedDecisionMakers,
  normalizeDecisionMakers,
  productImpliesRh,
  setCachedDecisionMakers,
  type LeadDecisionMaker,
} from "./decision-makers";

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
Produza um dossiê completo e confiável sobre a empresa abaixo para preparação de uma ligação/reunião comercial B2B.
Foque em: quem é a empresa, porte, mercado, produtos/serviços, notícias recentes, sinais de compra e pontos de atenção.
NÃO assuma que o produto vendido é de RH, People ou benefícios — a área compradora depende do contexto comercial informado pelo usuário (quando houver).

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

4. Use apenas fontes primárias ou de alta credibilidade: site oficial, LinkedIn corporativo, releases, Glassdoor, Great Place to Work, Valor Econômico, Brazil Journal, Exame, Receita Federal, Casa dos Dados, CNPJ.biz, Econodata.
5. JAMAIS invente dados. Se algo não foi encontrado, retorne EXATAMENTE a string "Informação não localizada em fontes abertas" para campos string, [] para arrays. Para CNPJ especificamente, retorne "CNPJ não encontrado" se nenhuma fonte pública confirmar.
6. Não use dados não públicos. Sem juízos de valor. Apenas evidências.
7. Idioma: português do Brasil.

[USO DE TOOLS — OBRIGATÓRIO]
Você TEM acesso às tools: people_search, web_search e fetch_url. Use-as ativamente para triangular fontes. Execute pelo menos 4–6 chamadas independentes:
(a) Notícias recentes via web_search: "${companyName} notícias 2025", "${companyName} contratação | expansão | fusão".
(b) CNPJ e razão social via web_search + fetch_url em Receita Federal, Casa dos Dados, CNPJ.biz, Econodata. Retorne TODOS os CNPJs encontrados (matriz + filiais) com fonte e URL.
(c) Sede / endereço via web_search + fetch_url (site oficial, Receita, LinkedIn). Se houver divergência, marque headquartersDivergence=true e explique em headquartersNote.
(d) Benefícios via web_search: Glassdoor, Indeed, LinkedIn, GPTW, site de carreiras.
(e) PEOPLE SEARCH (obrigatório): use people_search para mapear tomadores de decisão RELEVANTES AO CONTEXTO COMERCIAL (produto/solução vendida). NUNCA priorize RH/People por padrão — só busque RH/People/Benefícios quando o produto for claramente dessa área. Inclua nomes e cargos em attentionPoints e recommendedApproach. Se não encontrar, registre em attentionPoints.

[LÓGICA INTERNA — não exiba os passos, apenas aplique]
1. Confirmação de identidade (CNPJ, razão social, nome fantasia, sede, fundação).
2. Raio-X (faturamento estimado, funcionários com fonte/data/confiança, setor, produtos, presença geográfica, posicionamento).
3. Cultura e clima (Glassdoor, Indeed, LinkedIn, GPTW, ESG) com atenção a benefícios educacionais.
4. Momento atual (notícias respeitando a regra de recência acima).
5. Mapeamento de tomadores de decisão via people_search alinhado ao produto/contexto comercial (sem priorizar RH por padrão).
6. Síntese para abordagem consultiva.

[EXEMPLO DE RELATÓRIO PERFEITO — para referência de estrutura e rigor, NÃO copie valores]
Empresa de referência: DRZ Corporation. Este é o padrão de qualidade esperado:
{
  "companyName": "DRZ Corporation",
  "tradeName": "DRZ Corporation",
  "legalName": "DRZ Consultoria em Serviços de Informática Ltda",
  "cnpj": "03.873.532/0001-21",
  "cnpjSources": [
    { "cnpj": "03.873.532/0001-21", "source": "Econodata", "url": "https://www.econodata.com.br/consulta-empresa/..." },
    { "cnpj": "03.873.532/0001-21", "source": "Casa dos Dados", "url": "https://casadosdados.com.br/..." }
  ],
  "website": "drzcorp.com.br",
  "linkedinUrl": "https://www.linkedin.com/company/drz-corporation/",
  "headquarters": "São Paulo/SP — R. Cláudio Soares, 72, Pinheiros",
  "headquartersSources": [
    { "address": "R. Cláudio Soares, 72, Pinheiros, São Paulo/SP", "source": "Site oficial drzcorp.com.br/contato" },
    { "address": "Rua Cláudio Soares, 72, Sala 802, Pinheiros, SP", "source": "Cadastro Receita Federal" }
  ],
  "headquartersDivergence": false,
  "headquartersNote": "",
  "foundedYear": "Informação não localizada em fontes abertas (site indica +10 anos de mercado, sugerindo pré-2016)",
  "employees": "51-200",
  "employeeSource": "LinkedIn corporativo",
  "employeeUpdatedAt": "Nov/2025",
  "employeeConfidence": "Média",
  "industry": "Consultoria e Plataformas de Dados e IA / Governança e Analytics",
  "companySize": "Média",
  "revenue": "Informação não localizada em fontes abertas",
  "products": [
    "Smart Data Hub (integração e centralização)",
    "Smart Data Insights (dashboards)",
    "Smart Data & AI Governance",
    "Smart AI Platform (agentes de IA)",
    "Smart AI Fabric",
    "Smart Data RAG Layer",
    "Assessment de Maturidade de Dados/IAs",
    "Revenda Precisely Data Integrity Suite",
    "Smart Car Sales (vertical automotivo)"
  ],
  "geographicPresence": "Escritórios próprios no Brasil, Argentina, Colômbia e EUA. Atuação em múltiplos setores na América Latina e EUA.",
  "marketPositioning": "Referência em transformação, governança e inteligência de dados/IA. Parcerias com Precisely, Microsoft e Google. Comunica +320% de ROI em até 18 meses, +200 profissionais credenciados e +50 clientes. Diferencial: arquitetura API e schema-first com uso intenso de IA.",
  "executiveSummary": "DRZ Corporation é consultoria brasileira especializada em plataformas de dados e IA, com escritórios em quatro países e ~150 colaboradores. Perfil altamente técnico, sem benefício educacional formal identificado — espaço aberto para introduzir EduHub como diferencial de retenção de talento técnico.",
  "recentNews": [],
  "generalBenefits": [],
  "educationalBenefits": [],
  "consultedChannels": [
    { "channel": "Site oficial drzcorp.com.br", "findings": "Foco em soluções B2B; sem página de carreiras/cultura" },
    { "channel": "LinkedIn corporativo", "findings": "2K seguidores; sem menção a benefícios educacionais" },
    { "channel": "Glassdoor", "findings": "Sem avaliações públicas" }
  ],
  "educationalMaturity": {
    "level": "Inexistente",
    "justification": "Nenhuma evidência pública de auxílio-estudo, bolsas, universidade corporativa ou convênio educacional. Site institucional focado em marketing B2B, sem seção de carreiras ou cultura interna."
  },
  "fit": {
    "score": 9,
    "opportunities": [
      "Ausência total de programa educacional = entrada sem concorrência interna",
      "Perfil técnico (engenheiros/cientistas de dados) valoriza capacitação como retenção",
      "Presença multi-país favorece plataforma digital sem estrutura física",
      "Empresa de tecnologia tem cultura de aprendizado contínuo"
    ],
    "risks": [
      "Tomadores de decisão não identificados publicamente com clareza — validar no LinkedIn antes da call",
      "Consultoria B2B pode priorizar investimento em vendas/tecnologia sobre benefícios",
      "Baixo volume de dados públicos sobre cultura interna — risco de premissas incorretas"
    ]
  },
  "recommendedApproach": [
    "Conectar proposta ao perfil técnico da DRZ e à valorização de desenvolvimento contínuo em cargos de dados/IA",
    "Usar presença internacional (BR/AR/CO/EUA) como gancho: elegibilidade familiar do EduHub é diferencial para times distribuídos",
    "Posicionar EduHub como benefício inédito e sem concorrente interno a ser deslocado"
  ],
  "attentionPoints": [
    "CNPJ 03.873.532/0001-21 confirmado via Econodata — nome fantasia 'DRZ Corporation' difere da razão social; validar na Receita antes da reunião",
    "Sem notícias recentes localizadas nos últimos 12 meses em fontes abertas",
    "Tomadores de decisão não identificados publicamente — mapear no LinkedIn antes da call",
    "Faturamento e ano de fundação não localizados com precisão",
    "Sem certificação GPTW ou similar identificada"
  ],
  "discoveryQuestions": [
    "Hoje, quando um colaborador da DRZ quer se desenvolver — pós, certificação técnica, idioma — como a empresa apoia isso formalmente?",
    "Com atuação em BR/AR/CO/EUA, como vocês pensam em benefícios que façam sentido para times distribuídos?",
    "Existe alguma iniciativa de capacitação técnica que vocês gostariam de estruturar mas ainda não tiveram tempo ou recurso?"
  ],
  "dataCoverage": "Site oficial, LinkedIn corporativo, Econodata, Casa dos Dados, Glassdoor. Sem cobertura de mídia recente encontrada."
}

Reproduza esse mesmo NÍVEL de rigor e ESTRUTURA para a empresa solicitada — jamais copie os valores.

[FORMATO DE SAÍDA — OBRIGATÓRIO]
Retorne APENAS um JSON válido, sem markdown, sem blocos de código, sem texto fora do JSON. Estrutura exata:

{
  "companyName": "nome principal encontrado",
  "tradeName": "nome fantasia",
  "legalName": "razão social",
  "cnpj": "CNPJ formatado ou 'CNPJ não encontrado' se nenhuma fonte confirmar",
  "cnpjSources": [
    { "cnpj": "XX.XXX.XXX/XXXX-XX", "source": "Receita Federal | Casa dos Dados | CNPJ.biz | Econodata", "url": "URL da fonte" }
  ],
  "website": "domínio sem https://",
  "linkedinUrl": "URL completa do LinkedIn corporativo",
  "headquarters": "Cidade/Estado + endereço quando disponível",
  "headquartersSources": [
    { "address": "endereço completo encontrado", "source": "site oficial | Receita Federal | LinkedIn | Casa dos Dados", "url": "URL da fonte" }
  ],
  "headquartersDivergence": false,
  "headquartersNote": "vazio quando não houver divergência; caso contrário, explique brevemente o conflito entre fontes",
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

// ─── Etapa 1: Busca de leads por ICP ───────────────────────────────────────
export async function callEtapa1Leads(icp: string): Promise<string> {
  return callPerplexityAgent({
    model: getPerplexityModelLeads(), // google/gemini-3.1-flash-lite
    instructions: `Você é um assistente de inteligência comercial B2B.
Busque empresas que correspondam ao ICP informado.
Retorne lista estruturada com: nome, segmento, porte estimado e URL.
JAMAIS invente dados — use apenas fontes confirmadas.`,
    input: icp,
    maxSteps: 5,
    reasoningEffort: "medium",
    tools: [{ type: "web_search", search_context_size: "high" }],
  });
}

// ─── Etapa 2: Dossiê comercial ─────────────────────────────────────────────
export async function callEtapa2Dossie(companyName: string): Promise<string> {
  const fullPrompt = PROMPT_TEMPLATE(companyName);
  return callPerplexityAgent({
    model: getPerplexityModelDossie(), // anthropic/claude-haiku-4-5
    instructions: `Você é um assistente de inteligência comercial. Gere dossiês estruturados sobre empresas B2B. Não invente dados — se uma informação não for confirmada em fonte confiável, marque explicitamente como ausente ou divergente.

${fullPrompt}

IMPORTANTE: Retorne APENAS um JSON válido no formato especificado em [FORMATO DE SAÍDA], sem markdown, sem blocos de código, sem texto fora do JSON.`,
    input: `Gere o dossiê completo de inteligência comercial para a empresa: ${companyName}

Use web_search (notícias, CNPJ, sede, benefícios) e fetch_url (páginas oficiais e cadastros públicos) conforme as regras do prompt. Retorne somente o JSON final.`,
    maxSteps: 5,
    maxOutputTokens: 16000,
    reasoningEffort: "medium",
    tools: [{ type: "web_search", search_context_size: "high" }, { type: "fetch_url" }],
  });
}

// ─── Etapa 3: Mapeamento de decisores ──────────────────────────────────────
export async function callEtapa3Decisores(
  companyName: string,
  productContext?: string,
): Promise<string> {
  // OBRIGATÓRIO: people_search — mapeia tomadores de decisão (TDs) relevantes ao produto/contexto
  const productHint = productContext?.trim()
    ? `\nContexto do produto/solução vendida (use para priorizar áreas): ${productContext.trim()}`
    : "";
  return callPerplexityAgent({
    model: getPerplexityModelDecisores(), // openai/gpt-5-mini
    instructions: `Você identifica tomadores de decisão (TDs) em empresas B2B brasileiras.
OBRIGATÓRIO: use a tool people_search pelo menos uma vez.
Idioma: português do Brasil.

REGRAS DE PRIORIZAÇÃO (OBRIGATÓRIAS):
1. Analise o produto/solução informado e determine: área compradora ideal, área secundária, áreas relacionadas, influência na compra.
2. NUNCA priorize RH / People / Benefícios por padrão. Só priorize RH quando o contexto comercial indicar explicitamente RH, People, benefícios, recrutamento ou talent.
3. Ranking típico por tipo de produto:
   - Benefícios corporativos / RH / People → Diretor de RH, Gerente de RH, Diretor Administrativo, Diretor Financeiro, COO, CEO
   - ERP / Industrial / Produção → Diretor Industrial, Gerente de Produção, Diretor de Operações, COO, CEO
   - Marketing / Agência / Growth → Diretor de Marketing, Head de Growth, CMO, Diretor Comercial, CEO
   - Financeiro / Contábil / Fiscal → CFO, Controller, Diretor Financeiro, CEO
   - TI / Software / SaaS genérico → CTO, Diretor de TI, Head de Produto, COO, CEO
   - Facilities / Limpeza / Segurança → Diretor Admin, Facilities Manager, COO, CEO
4. Cascata se não encontrar a área ideal:
   Área ideal → Área secundária → Área relacionada → Diretoria → Sócios → CEO
5. Valide se o profissional AINDA trabalha na empresa. Descarte indícios de desligamento (ex-, formerly, demitido).
6. Prefira perfis com cargo atual, LinkedIn atualizado, presença no site da empresa ou fonte recente.
7. Ordene decisionMakers por priority crescente e score decrescente (1 = maior prioridade).
8. Evite duplicados (mesmo nome+cargo).

Retorne APENAS um JSON válido, sem markdown:
{
  "decisionMakers": [
    {
      "name": "Nome completo",
      "title": "Cargo atual",
      "area": "Área compradora (ex: Operações, Marketing, Financeiro, TI — NÃO use RH a menos que o produto seja de RH)",
      "priority": 1,
      "score": 0.92,
      "probabilidade_decisor": 0.85,
      "linkedinUrl": "https://www.linkedin.com/in/slug-ou-vazio",
      "employment_verified": true,
      "source": "linkedin | site | notícia",
      "notes": "evidência curta (ex.: cargo atual no LinkedIn · 2025)"
    }
  ]
}
Se não encontrar ninguém, retorne {"decisionMakers": []}.
Nunca invente LinkedIn — só inclua linkedinUrl se vier de fonte pública confirmada.`,
    input: `Mapeie os tomadores de decisão da empresa: ${companyName}${productHint}`,
    maxSteps: 5,
    reasoningEffort: "medium",
    tools: [
      {
        type: "people_search",
        max_tokens: 10000,
        max_tokens_per_page: 1000,
      },
    ],
  });
}

/**
 * Pipeline completo: Etapa 2 (dossiê JSON) + Etapa 3 (decisores).
 * Mescla o resultado de decisores em attentionPoints do relatório.
 */
async function callLlmWithRetry(
  companyName: string,
  productContext?: string,
  ctxHash?: string,
): Promise<string> {
  // Etapa 2 — dossiê estruturado (obrigatória)
  const dossieText = await callEtapa2Dossie(companyName);
  if (!dossieText?.trim()) throw new Error("Resposta vazia da IA (Etapa 2 — dossiê)");

  // Etapa 3 — decisores (best-effort; não quebra o fluxo se falhar)
  let decisoresText = "";
  try {
    decisoresText = await callEtapa3Decisores(companyName, productContext);
  } catch (err) {
    console.warn(
      "[intelligence-report] Etapa 3 (decisores) falhou — seguindo só com dossiê:",
      err instanceof Error ? err.message : String(err),
    );
  }

  // Se não há decisores, devolve o dossiê puro
  if (!decisoresText.trim()) return dossieText;

  // Mescla decisionMakers estruturados no JSON do dossiê (normalizados)
  try {
    const report = extractJson(dossieText) as Record<string, unknown>;
    let makers: LeadDecisionMaker[] = [];
    try {
      const parsed = extractJson(decisoresText);
      makers = normalizeDecisionMakers(parsed);
    } catch {
      makers = [];
    }
    // Cache em memória alinhado à chave usada na prospecção
    if (ctxHash) {
      setCachedDecisionMakers(companyName, ctxHash, makers);
    }
    report.decisionMakers = makers;
    if (makers.length === 0) {
      const existing = Array.isArray(report.attentionPoints)
        ? (report.attentionPoints as unknown[]).map(String)
        : [];
      report.attentionPoints = [
        ...existing,
        "Nenhum tomador de decisão identificado via people_search em fontes públicas.",
      ];
    }
    return JSON.stringify(report);
  } catch {
    return dossieText;
  }
}

/** Validate a Brazilian CNPJ using the mod-11 check-digit algorithm. */
function isValidCnpj(input: string): boolean {
  const digits = (input || "").replace(/\D/g, "");
  if (digits.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(digits)) return false;
  const calc = (base: string): number => {
    const weights =
      base.length === 12
        ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = base.split("").reduce((acc, d, i) => acc + Number(d) * weights[i], 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  const d1 = calc(digits.slice(0, 12));
  const d2 = calc(digits.slice(0, 12) + String(d1));
  return d1 === Number(digits[12]) && d2 === Number(digits[13]);
}

function sanitizeCnpjs(report: Record<string, unknown>): string[] {
  const warnings: string[] = [];
  const cnpjStr = typeof report.cnpj === "string" ? report.cnpj : "";
  if (cnpjStr && cnpjStr.toLowerCase() !== "cnpj não encontrado" && !isValidCnpj(cnpjStr)) {
    warnings.push(
      `CNPJ retornado (${cnpjStr}) falhou na validação de dígito verificador — substituído por "CNPJ não encontrado".`,
    );
    report.cnpj = "CNPJ não encontrado";
  }
  const sources = Array.isArray(report.cnpjSources)
    ? (report.cnpjSources as Array<Record<string, unknown>>)
    : [];
  const filtered = sources.filter((s) => {
    const v = typeof s?.cnpj === "string" ? s.cnpj : "";
    if (!v) return false;
    if (!isValidCnpj(v)) {
      warnings.push(
        `Fonte descartada: CNPJ inválido "${v}" (${String(s?.source ?? "sem fonte")}).`,
      );
      return false;
    }
    return true;
  });
  report.cnpjSources = filtered;
  return warnings;
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
  oQueVende: z.string().optional(),
  diferencial: z.string().optional(),
  infoExtra: z.string().optional(),
});

export const generateIntelligenceReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => GenerateInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const key = normalizeCompanyKey(data.companyName) || data.companyName.toLowerCase();
    const productCtx = buildProductContext(data.oQueVende, data.diferencial, data.infoExtra);
    const ctxHash = commercialContextHash(data.oQueVende, data.diferencial, data.infoExtra);
    const sinceIso = new Date(Date.now() - SIX_HOURS_MS).toISOString();

    // Reaproveita relatório recente do próprio usuário (6h) SOMENTE se o
    // contexto comercial (produto) for o mesmo — evita reutilizar TDs/dossiê
    // gerados para outro produto vendido.
    const { data: recent } = await supabase
      .from("intelligence_reports")
      .select("id, company_name, report, created_at")
      .eq("user_id", userId)
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false })
      .limit(30);
    const hit = (recent ?? []).find((r) => {
      if (normalizeCompanyKey(r.company_name) !== key) return false;
      const rep = r.report as Record<string, unknown> | null;
      const storedHash =
        rep && typeof rep === "object" && typeof rep._commercialContextHash === "string"
          ? (rep._commercialContextHash as string)
          : "";
      // Relatórios antigos sem hash: só reaproveita se o pedido atual também não tem contexto
      if (!storedHash) return !productCtx;
      return storedHash === ctxHash;
    });
    if (hit) {
      const mapped = mapAiToReport(
        hit.report as Record<string, unknown>,
        data.companyName,
        hit.id,
        hit.created_at,
      );
      return { report: mapped, id: hit.id, createdAt: hit.created_at, cached: true };
    }

    // Rate limit só quando vai chamar a LLM (cache-hit acima não conta).
    // 10 dossiês/hora por usuário: prompt gigante + fetch caro.
    const rl = checkRateLimit(userId, "intelligence_report", 10, 60 * 60_000);
    if (!rl.ok) {
      throw new Error(rateLimitMessage(rl, "geração de dossiê"));
    }

    let content: string;
    try {
      content = await callLlmWithRetry(data.companyName, productCtx || undefined, ctxHash);
    } catch (err) {
      const msg = (err as Error).message ?? String(err);
      const friendly = /429|rate|quota|RESOURCE_EXHAUSTED|402|cota free|Saldo/i.test(msg)
        ? "Limite de requisições / cota da Perplexity atingido. Tente novamente mais tarde."
        : /API key|API_KEY|ausente|invalid|403|PERMISSION|Unauthorized|Perplexity/i.test(msg)
          ? "Chave da Perplexity inválida ou ausente. Verifique PERPLEXITY_API_KEY nos Secrets do Lovable."
          : `Falha ao contatar a LLM (Perplexity Agent): ${msg}`;
      throw new Error(friendly);
    }

    let rawReport: Json;
    try {
      rawReport = extractJson(content) as Json;
    } catch (err) {
      throw new Error(`JSON inválido retornado pela LLM: ${(err as Error).message}`);
    }
    validateReport(rawReport);
    // Marca o contexto comercial no JSON persistido para o cache respeitar o produto
    (rawReport as Record<string, unknown>)._commercialContextHash = ctxHash;
    (rawReport as Record<string, unknown>)._commercialContext = productCtx || null;
    const cnpjWarnings = sanitizeCnpjs(rawReport as Record<string, unknown>);
    if (cnpjWarnings.length) {
      const rec = rawReport as Record<string, unknown>;
      const existing = Array.isArray(rec.attentionPoints)
        ? (rec.attentionPoints as unknown[]).map(String)
        : [];
      rec.attentionPoints = [...existing, ...cnpjWarnings];
    }

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

const ByCompanyInput = z.object({ companyName: z.string().min(1).max(200) });

/** Busca TDs do último relatório de inteligência da empresa (mesmo usuário). */
export const getDecisionMakersByCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ByCompanyInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const key = normalizeCompanyKey(data.companyName) || data.companyName.toLowerCase();
    const { data: rows } = await supabase
      .from("intelligence_reports")
      .select("id, company_name, report, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(30);
    const hit = (rows ?? []).find((r) => normalizeCompanyKey(r.company_name) === key);
    if (!hit)
      return {
        decisionMakers: [] as Array<{
          name: string;
          title: string;
          linkedinUrl?: string;
          notes?: string;
        }>,
        reportId: null as string | null,
      };
    const mapped = mapAiToReport(
      hit.report as Record<string, unknown>,
      data.companyName,
      hit.id,
      hit.created_at,
    );
    return {
      decisionMakers: mapped.decisionMakers ?? [],
      reportId: hit.id as string,
    };
  });

/**
 * Busca TDs para uma empresa no fluxo de prospecção (sem gerar dossiê completo).
 * - Usa cache em memória (TTL 6h) keyed por empresa + contexto comercial
 * - Falhas retornam lista vazia (nunca lançam)
 */
export async function searchDecisionMakersForCompany(
  companyName: string,
  opts?: {
    oQueVende?: string;
    diferencial?: string;
    infoExtra?: string;
  },
): Promise<LeadDecisionMaker[]> {
  const productCtx = buildProductContext(opts?.oQueVende, opts?.diferencial, opts?.infoExtra);
  const ctxHash = commercialContextHash(opts?.oQueVende, opts?.diferencial, opts?.infoExtra);

  const cached = getCachedDecisionMakers(companyName, ctxHash);
  if (cached) return cached;

  try {
    // Reforça no input quando o produto NÃO é de RH
    const rhHint = productImpliesRh(productCtx)
      ? "\nContexto indica produto de RH/People/benefícios — priorize decisores dessa área."
      : "\nContexto NÃO é de RH: NÃO priorize RH/People. Foque na área compradora do produto informado.";
    const text = await callEtapa3Decisores(
      companyName,
      productCtx ? `${productCtx}${rhHint}` : `Produto não informado.${rhHint}`,
    );
    if (!text?.trim()) {
      setCachedDecisionMakers(companyName, ctxHash, []);
      return [];
    }
    let parsed: unknown;
    try {
      parsed = extractJsonLoose(text);
    } catch {
      parsed = null;
    }
    const makers = normalizeDecisionMakers(parsed);
    setCachedDecisionMakers(companyName, ctxHash, makers);
    return makers;
  } catch (err) {
    console.warn(
      "[searchDecisionMakersForCompany] falha não-fatal:",
      err instanceof Error ? err.message : String(err),
    );
    return [];
  }
}
