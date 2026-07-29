/**
 * Free enrichment helpers for LeadForge
 *
 * Pipeline resiliente:
 *   Empresa → Website → fetch() (com timeout) → Cheerio (limpeza)
 *          → descoberta automática de páginas do mesmo domínio
 *          → normalização → texto estruturado + sinais
 *
 * Limites obrigatórios:
 *   - Máx 10 páginas por domínio
 *   - Timeout 10s por página
 *   - Timeout total 30s por empresa
 *   - Nunca lançar exceção para o chamador
 *   - Logs estruturados de cada requisição
 */

// IMPORTANT: use `cheerio/slim` — the default `cheerio` entrypoint pulls in
// `undici`, which breaks on Cloudflare Workers with
// "Cannot read properties of undefined (reading 'markAsUncloneable')".
import * as cheerio from "cheerio/slim";

export type CnpjData = {
  cnpj: string;
  razao_social: string | null;
  nome_fantasia: string | null;
  cnae: string | null;
  cnae_descricao: string | null;
  porte_oficial: string | null;
  situacao: string | null;
  uf: string | null;
  municipio: string | null;
  capital_social: string | null;
  fonte: "opencnpj" | "minhareceita" | "brasilapi";
};

/** Structured scrape result (kept name for backward compat with existing callers). */
/** Contato classificado extraído do site / busca pública. */
export type ClassifiedContact = {
  tipo:
    | "telefone_fixo"
    | "whatsapp"
    | "telefone_comercial"
    | "sac"
    | "email"
    | "formulario"
    | "central_comercial"
    | "site"
    | "linkedin";
  valor: string;
  origem: string;
  evidencia?: string | null;
};

/** Structured scrape result (kept name for backward compat with existing callers). */
export type JinaResult = {
  ok: boolean;
  markdown: string;
  linkedin: string | null;
  cnpjCandidates: string[];
  title: string | null;
  emails: string[];
  telefones: string[];
  produtos: string[];
  servicos: string[];
  /** Contatos classificados com origem/evidência */
  contatos: ClassifiedContact[];
  whatsapp: string | null;
  telefone_fixo: string | null;
  telefone_comercial: string | null;
  sac: string | null;
};

const CNPJ_REGEX = /\b(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})\b/g;

/** Limits — mandatory per spec */
const MAX_PAGES_PER_DOMAIN = 10;
const PAGE_TIMEOUT_MS = 10_000;
const TOTAL_TIMEOUT_MS = 30_000;

/** Paths automatically discovered on the target domain. */
const CANDIDATE_PATHS = [
  "",
  "/about",
  "/sobre",
  "/quem-somos",
  "/empresa",
  "/institucional",
  "/contato",
  "/contact",
  "/fale-conosco",
  "/atendimento",
  "/contato.html",
  "/contact-us",
  "/central-de-atendimento",
  "/carreiras",
  "/vagas",
  "/produtos",
  "/servicos",
  "/solucoes",
  "/blog",
  "/noticias",
  "/faq",
];

const IGNORED_PROTOCOLS = /^(mailto:|tel:|javascript:|data:|#)/i;
const IGNORED_EXT =
  /\.(pdf|png|jpe?g|gif|svg|webp|bmp|zip|rar|7z|tar|gz|mp4|mp3|wav|avi|mov|doc|docx|xls|xlsx|ppt|pptx)(\?|#|$)/i;

/** Normalize to 14 digits only */
export function onlyDigitsCnpj(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 14);
}

export function isValidCnpjFormat(digits: string): boolean {
  return /^\d{14}$/.test(digits);
}

export function extractCnpjsFromText(text: string): string[] {
  if (!text) return [];
  const found = new Set<string>();
  const matches = text.matchAll(CNPJ_REGEX);
  for (const m of matches) {
    const digits = onlyDigitsCnpj(m[1]);
    if (isValidCnpjFormat(digits) && digits !== "00000000000000") {
      found.add(digits);
    }
  }
  return [...found];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type FetchLog = {
  company?: string;
  url: string;
  status: number | string;
  ms: number;
  bytes?: number;
  discardReason?: string;
  error?: string;
};

function logScrape(entry: FetchLog): void {
  // Log estruturado em uma linha para facilitar grep
  try {
    console.log(`[scrape] ${JSON.stringify(entry)}`);
  } catch {
    /* nunca deve derrubar */
  }
}

/** Fetch de UMA página com timeout individual + retries curtos (500ms, 1s). */
async function fetchPage(
  url: string,
  company: string | undefined,
  externalSignal?: AbortSignal,
): Promise<{ res: Response | null; ms: number; html: string | null; err?: string }> {
  const start = Date.now();
  let lastErr: string | undefined;

  for (let attempt = 0; attempt < 2; attempt++) {
    if (externalSignal?.aborted) {
      const ms = Date.now() - start;
      logScrape({ company, url, status: "aborted-total", ms, discardReason: "total_timeout" });
      return { res: null, ms, html: null, err: "aborted" };
    }

    const pageCtrl = new AbortController();
    const pageTimer = setTimeout(() => pageCtrl.abort(), PAGE_TIMEOUT_MS);
    const onExternalAbort = () => pageCtrl.abort();
    externalSignal?.addEventListener("abort", onExternalAbort, { once: true });

    try {
      const res = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: pageCtrl.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; LeadForgeBot/1.0; +https://leadforge.app)",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
        },
      });

      const ms = Date.now() - start;

      if (!res.ok) {
        logScrape({ company, url, status: res.status, ms, discardReason: `http_${res.status}` });
        // 4xx (exceto 429) não vale re-tentar
        if (res.status >= 400 && res.status < 500 && res.status !== 429) {
          return { res: null, ms, html: null, err: `http_${res.status}` };
        }
        lastErr = `http_${res.status}`;
      } else {
        const ct = res.headers.get("content-type") ?? "";
        if (!/text\/html|application\/xhtml/i.test(ct)) {
          logScrape({ company, url, status: res.status, ms, discardReason: `content_type:${ct}` });
          return { res: null, ms, html: null, err: "non_html" };
        }
        let html = "";
        try {
          html = await res.text();
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : String(e);
          logScrape({
            company,
            url,
            status: res.status,
            ms,
            error: errMsg,
            discardReason: "read_body_failed",
          });
          return { res: null, ms, html: null, err: errMsg };
        }
        logScrape({ company, url, status: res.status, ms, bytes: html.length });
        return { res, ms, html };
      }
    } catch (e) {
      const ms = Date.now() - start;
      const errMsg = e instanceof Error ? e.message : String(e);
      const isTimeout = /abort|timeout/i.test(errMsg);
      logScrape({
        company,
        url,
        status: isTimeout ? "timeout" : "network_error",
        ms,
        error: errMsg,
      });
      lastErr = errMsg;
    } finally {
      clearTimeout(pageTimer);
      externalSignal?.removeEventListener("abort", onExternalAbort);
    }

    if (attempt < 1) await sleep(500);
  }

  return { res: null, ms: Date.now() - start, html: null, err: lastErr };
}

function normalizeBaseUrl(u: string): { base: string; origin: string; host: string } | null {
  try {
    let s = u.trim();
    if (!s) return null;
    if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
    const url = new URL(s);
    if (!url.hostname) return null;
    return { base: `${url.protocol}//${url.host}`, origin: url.origin, host: url.host };
  } catch {
    return null;
  }
}

function isSameOrigin(href: string, base: string, origin: string): string | null {
  if (!href) return null;
  if (IGNORED_PROTOCOLS.test(href)) return null;
  try {
    const abs = new URL(href, base);
    if (abs.origin !== origin) return null;
    if (IGNORED_EXT.test(abs.pathname)) return null;
    abs.hash = "";
    return abs.toString();
  } catch {
    return null;
  }
}

function classifyPhoneContext(nearby: string): ClassifiedContact["tipo"] {
  const t = nearby
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (/\b(whats?app|wa\.me|api\.whatsapp|zap)\b/.test(t)) return "whatsapp";
  if (/\b(sac|ouvidoria|0800|consumidor|reclame)\b/.test(t)) return "sac";
  if (/\b(comercial|vendas|sales|or[cç]amento|contato comercial|televendas)\b/.test(t))
    return "telefone_comercial";
  if (/\b(central|atendimento|call ?center|suporte)\b/.test(t)) return "central_comercial";
  // celular BR (9 dígitos após DDD) sem menção a WhatsApp → comercial/fixo genérico
  return "telefone_fixo";
}

function extractContactsFromHtml(html: string, pageUrl: string): ClassifiedContact[] {
  const $ = cheerio.load(html);
  const contacts: ClassifiedContact[] = [];
  const seen = new Set<string>();

  const push = (c: ClassifiedContact) => {
    const key = `${c.tipo}|${c.valor}`;
    if (seen.has(key)) return;
    seen.add(key);
    contacts.push(c);
  };

  // WhatsApp links — evidência explícita
  $("a[href]").each((_i, el) => {
    const href = ($(el).attr("href") || "").trim();
    const label = $(el).text().replace(/\s+/g, " ").trim().slice(0, 80);
    if (!href) return;

    const hrefLower = href.toLowerCase();
    if (
      hrefLower.includes("wa.me/") ||
      hrefLower.includes("api.whatsapp.com") ||
      hrefLower.startsWith("whatsapp://")
    ) {
      const digits = href.replace(/\D/g, "");
      // wa.me/5511999... — remove country code noise for display
      const valor = digits.length >= 10 ? digits : href;
      push({
        tipo: "whatsapp",
        valor,
        origem: pageUrl,
        evidencia: label || href.slice(0, 120),
      });
      return;
    }

    if (hrefLower.startsWith("tel:")) {
      const valor = href.replace(/^tel:/i, "").trim();
      const parentText = $(el).parent().text().replace(/\s+/g, " ").trim().slice(0, 160);
      const nearby = `${label} ${parentText}`;
      push({
        tipo: classifyPhoneContext(nearby),
        valor,
        origem: pageUrl,
        evidencia: nearby.slice(0, 120) || null,
      });
      return;
    }

    if (hrefLower.startsWith("mailto:")) {
      const valor = href
        .replace(/^mailto:/i, "")
        .split("?")[0]
        .trim();
      if (valor && valor.includes("@")) {
        push({
          tipo: "email",
          valor,
          origem: pageUrl,
          evidencia: label || null,
        });
      }
      return;
    }

    // Formulário de contato
    if (
      /(contato|contact|fale-conosco|atendimento)/i.test(href) &&
      /(form|formulario|fale)/i.test(label + href)
    ) {
      try {
        const abs = new URL(href, pageUrl).toString();
        push({
          tipo: "formulario",
          valor: abs,
          origem: pageUrl,
          evidencia: label || null,
        });
      } catch {
        /* ignore */
      }
    }
  });

  // Texto do body+footer (NÃO remover footer antes desta extração)
  const fullText = $("body").text().replace(/\s+/g, " ").trim();

  // E-mails no texto
  for (const m of fullText.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) ?? []) {
    if (/\.(png|jpg|jpeg|svg|gif|webp)$/i.test(m)) continue;
    push({ tipo: "email", valor: m, origem: pageUrl, evidencia: null });
  }

  // Telefones no texto com janela de contexto
  const phoneRe = /(?:\+?55\s?)?\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}/g;
  let match: RegExpExecArray | null;
  const re = new RegExp(phoneRe);
  while ((match = re.exec(fullText)) !== null) {
    const valor = match[0].trim();
    const start = Math.max(0, match.index - 40);
    const end = Math.min(fullText.length, match.index + valor.length + 40);
    const nearby = fullText.slice(start, end);
    // Só marca WhatsApp se houver evidência no contexto próximo
    const tipo = classifyPhoneContext(nearby);
    push({
      tipo,
      valor,
      origem: pageUrl,
      evidencia: nearby.slice(0, 120),
    });
  }

  return contacts;
}

function extractStructuredFromHtml(
  html: string,
  base: string,
  origin: string,
  pageUrl: string,
): {
  text: string;
  title: string | null;
  linkedin: string | null;
  internalLinks: string[];
  contatos: ClassifiedContact[];
} {
  const $ = cheerio.load(html);

  // coletar links ANTES de remover nav/header/footer (podem ter menus úteis)
  const internalLinks = new Set<string>();
  $("a[href]").each((_i, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    const abs = isSameOrigin(href, base, origin);
    if (abs) internalLinks.add(abs);
  });

  // linkedin
  const linkedin =
    $("a[href*='linkedin.com/company/'], a[href*='linkedin.com/in/']")
      .first()
      .attr("href")
      ?.trim() ?? null;

  // Contatos ANTES de remover footer/header — rodapé costuma ter telefone/WhatsApp
  const contatos = extractContactsFromHtml(html, pageUrl);

  // Limpeza: remover ruído (após extrair contatos)
  $(
    [
      "script",
      "style",
      "iframe",
      "svg",
      "nav",
      "footer",
      "header",
      "aside",
      "noscript",
      "[class*='cookie' i]",
      "[id*='cookie' i]",
      "[class*='banner' i]",
      "[class*='newsletter' i]",
      "[role='banner']",
      "[role='navigation']",
    ].join(", "),
  ).remove();

  const metaDesc =
    $('meta[name="description"]').attr("content")?.trim() ||
    $('meta[property="og:description"]').attr("content")?.trim() ||
    "";
  const title =
    $("title").first().text().trim() ||
    $("h1").first().text().trim() ||
    $('meta[property="og:title"]').attr("content")?.trim() ||
    null;

  const bodyText = $("body").text().replace(/\s+/g, " ").trim();
  const text = [metaDesc, bodyText].filter(Boolean).join(" ").slice(0, 6000);

  return { text, title, linkedin, internalLinks: [...internalLinks], contatos };
}

function mineListSignals(text: string, kw: RegExp): string[] {
  const lines = text
    .split(/[•\n.;]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 15 && s.length < 220 && kw.test(s));
  return [...new Set(lines)].slice(0, 6);
}

/**
 * Scraping principal. NUNCA lança exceção — sempre retorna JinaResult.
 * Aplica limites: 10 páginas / 10s por página / 30s no total.
 */
export async function scrapeSite(
  rootUrl: string,
  opts?: { company?: string },
): Promise<JinaResult> {
  const started = Date.now();
  const company = opts?.company;

  const empty: JinaResult = {
    ok: false,
    markdown: "",
    linkedin: null,
    cnpjCandidates: [],
    title: null,
    emails: [],
    telefones: [],
    produtos: [],
    servicos: [],
    contatos: [],
    whatsapp: null,
    telefone_fixo: null,
    telefone_comercial: null,
    sac: null,
  };

  const norm = normalizeBaseUrl(rootUrl);
  if (!norm) {
    logScrape({
      company,
      url: rootUrl,
      status: "invalid_url",
      ms: 0,
      discardReason: "invalid_url",
    });
    return empty;
  }

  // Timeout global de 30s
  const totalCtrl = new AbortController();
  const totalTimer = setTimeout(() => totalCtrl.abort(), TOTAL_TIMEOUT_MS);

  const seen = new Set<string>();
  const queue: string[] = [];
  const chunks: string[] = [];
  const allContatos: ClassifiedContact[] = [];
  const contatoSeen = new Set<string>();
  let title: string | null = null;
  let linkedin: string | null = null;
  let visited = 0;
  let discovered = 0;

  // Semear com raiz + candidatas conhecidas (contato prioritário no início da lista)
  for (const path of CANDIDATE_PATHS) {
    queue.push(`${norm.base}${path}`);
  }

  try {
    while (queue.length > 0 && visited < MAX_PAGES_PER_DOMAIN) {
      if (totalCtrl.signal.aborted) break;
      const u = queue.shift()!;
      if (seen.has(u)) continue;
      seen.add(u);

      const { res, html } = await fetchPage(u, company, totalCtrl.signal);
      if (!res || !html || html.length < 200) continue;

      // Confirma mesmo domínio após eventuais redirects
      try {
        const finalUrl = new URL(res.url);
        if (finalUrl.origin !== norm.origin) {
          logScrape({
            company,
            url: u,
            status: res.status,
            ms: 0,
            discardReason: `redirect_external:${finalUrl.origin}`,
          });
          continue;
        }
      } catch {
        /* segue */
      }

      visited++;
      const parsed = extractStructuredFromHtml(html, norm.base, norm.origin, res.url || u);
      if (!title && parsed.title) title = parsed.title;
      if (!linkedin && parsed.linkedin) linkedin = parsed.linkedin;
      if (parsed.text.length > 60) chunks.push(parsed.text);
      for (const c of parsed.contatos) {
        const k = `${c.tipo}|${c.valor}`;
        if (contatoSeen.has(k)) continue;
        contatoSeen.add(k);
        allContatos.push(c);
      }

      // Descoberta adicional dentro do mesmo domínio
      for (const link of parsed.internalLinks) {
        if (seen.has(link)) continue;
        if (queue.includes(link)) continue;
        // heurística: dar prioridade a slugs institucionais / contato
        if (
          /(about|sobre|quem-somos|empresa|institucional|carreir|vagas|produt|servic|solu[cç]|blog|noticia|faq|contato|contact|fale-conosco|atendimento)/i.test(
            link,
          )
        ) {
          queue.push(link);
          discovered++;
        }
        if (queue.length + visited >= MAX_PAGES_PER_DOMAIN * 3) break;
      }
    }
  } catch (e) {
    logScrape({
      company,
      url: norm.base,
      status: "loop_error",
      ms: Date.now() - started,
      error: e instanceof Error ? e.message : String(e),
    });
  } finally {
    clearTimeout(totalTimer);
  }

  const combined = chunks.join("\n\n").slice(0, 12000);
  const totalMs = Date.now() - started;
  logScrape({
    company,
    url: norm.base,
    status: combined ? "done" : "empty",
    ms: totalMs,
    bytes: combined.length,
    discardReason: `visited=${visited};discovered=${discovered};contatos=${allContatos.length}`,
  });

  // Preferência: contatos classificados; fallback: regex no texto agregado
  const emailsFromContacts = allContatos.filter((c) => c.tipo === "email").map((c) => c.valor);
  const phonesFromContacts = allContatos
    .filter((c) =>
      ["telefone_fixo", "whatsapp", "telefone_comercial", "sac", "central_comercial"].includes(
        c.tipo,
      ),
    )
    .map((c) => c.valor);

  const emails = [
    ...new Set([
      ...emailsFromContacts,
      ...(combined.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) ?? []).filter(
        (e) => !/\.(png|jpg|jpeg|svg|gif|webp)$/i.test(e),
      ),
    ]),
  ].slice(0, 8);

  const telefones = [
    ...new Set([
      ...phonesFromContacts,
      ...(combined.match(/(?:\+?55\s?)?\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}/g) ?? []),
    ]),
  ].slice(0, 8);

  // Pick best per kind (first wins — pages visited in priority order)
  const pick = (tipo: ClassifiedContact["tipo"]) =>
    allContatos.find((c) => c.tipo === tipo)?.valor ?? null;

  if (linkedin) {
    allContatos.push({
      tipo: "linkedin",
      valor: linkedin,
      origem: norm.base,
      evidencia: null,
    });
  }
  allContatos.push({
    tipo: "site",
    valor: norm.base,
    origem: "scrape",
    evidencia: null,
  });

  const cnpjCandidates = extractCnpjsFromText(combined);
  const produtos = mineListSignals(combined, /\bprodutos?\b/i);
  const servicos = mineListSignals(combined, /\bservi[cç]os?\b/i);

  if (!combined && allContatos.length === 0) return empty;

  return {
    ok: true,
    markdown: combined,
    linkedin,
    cnpjCandidates,
    title,
    emails,
    telefones,
    produtos,
    servicos,
    contatos: allContatos.slice(0, 40),
    whatsapp: pick("whatsapp"),
    telefone_fixo: pick("telefone_fixo"),
    telefone_comercial: pick("telefone_comercial") ?? pick("central_comercial"),
    sac: pick("sac"),
  };
}

/** Alias de compatibilidade. */
export const jinaReader = scrapeSite;

/** JSON fetch com retries + backoff. Nunca lança. */
async function fetchJsonWithRetry(url: string, attempts = 3): Promise<unknown | null> {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(10_000),
        headers: { Accept: "application/json" },
      });
      if (res.ok) return await res.json();
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        return null;
      }
    } catch {
      /* retry */
    }
    if (i < attempts - 1) await sleep(500 * Math.pow(2, i));
  }
  return null;
}

async function fetchOpenCnpj(cnpj: string): Promise<CnpjData | null> {
  const res = await fetchJsonWithRetry(`https://api.opencnpj.org/${cnpj}`);
  if (!res) return null;
  const j = res as Record<string, unknown>;
  const razao = (j.razao_social as string) || (j.razaoSocial as string) || null;
  const fantasia = (j.nome_fantasia as string) || (j.nomeFantasia as string) || null;
  if (!razao && !fantasia) return null;
  return {
    cnpj,
    razao_social: razao,
    nome_fantasia: fantasia,
    cnae: String(j.cnae_principal ?? j.cnae_fiscal ?? j.cnae ?? "") || null,
    cnae_descricao:
      (j.cnae_principal_descricao as string) || (j.cnae_fiscal_descricao as string) || null,
    porte_oficial: (j.porte_empresa as string) || (j.porte as string) || null,
    situacao:
      (j.situacao_cadastral as string) ||
      (j.situacaoCadastral as string) ||
      (j.descricao_situacao_cadastral as string) ||
      null,
    uf: (j.uf as string) || null,
    municipio: (j.municipio as string) || null,
    capital_social: j.capital_social != null ? String(j.capital_social) : null,
    fonte: "opencnpj",
  };
}

async function fetchMinhaReceita(cnpj: string): Promise<CnpjData | null> {
  const j = (await fetchJsonWithRetry(`https://minhareceita.org/${cnpj}`)) as Record<
    string,
    unknown
  > | null;
  if (!j) return null;
  const razao = (j.razao_social as string) || null;
  const fantasia = (j.nome_fantasia as string) || null;
  if (!razao && !fantasia) return null;
  return {
    cnpj,
    razao_social: razao,
    nome_fantasia: fantasia,
    cnae: j.cnae_fiscal != null ? String(j.cnae_fiscal) : null,
    cnae_descricao: (j.cnae_fiscal_descricao as string) || null,
    porte_oficial: (j.porte as string) || null,
    situacao:
      (j.descricao_situacao_cadastral as string) ||
      (j.situacao_cadastral != null ? String(j.situacao_cadastral) : null),
    uf: (j.uf as string) || null,
    municipio: (j.municipio as string) || null,
    capital_social: j.capital_social != null ? String(j.capital_social) : null,
    fonte: "minhareceita",
  };
}

async function fetchBrasilApi(cnpj: string): Promise<CnpjData | null> {
  const j = (await fetchJsonWithRetry(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`)) as Record<
    string,
    unknown
  > | null;
  if (!j) return null;
  const razao = (j.razao_social as string) || null;
  const fantasia = (j.nome_fantasia as string) || null;
  if (!razao && !fantasia) return null;
  return {
    cnpj,
    razao_social: razao,
    nome_fantasia: fantasia,
    cnae: j.cnae_fiscal != null ? String(j.cnae_fiscal) : null,
    cnae_descricao: (j.cnae_fiscal_descricao as string) || null,
    porte_oficial: (j.descricao_porte as string) || (j.porte != null ? String(j.porte) : null),
    situacao:
      (j.descricao_situacao_cadastral as string) ||
      (j.situacao_cadastral != null ? String(j.situacao_cadastral) : null),
    uf: (j.uf as string) || null,
    municipio: (j.municipio as string) || null,
    capital_social: j.capital_social != null ? String(j.capital_social) : null,
    fonte: "brasilapi",
  };
}

export async function lookupCnpj(cnpjRaw: string): Promise<CnpjData | null> {
  const cnpj = onlyDigitsCnpj(cnpjRaw);
  if (!isValidCnpjFormat(cnpj)) return null;
  try {
    return (
      (await fetchBrasilApi(cnpj)) ?? (await fetchOpenCnpj(cnpj)) ?? (await fetchMinhaReceita(cnpj))
    );
  } catch (e) {
    console.warn(`[lookupCnpj] falhou para ${cnpj}:`, e);
    return null;
  }
}

/**
 * Enriquecimento completo e resiliente para um lead.
 * NUNCA lança exceção — retorna sempre a estrutura completa.
 */
export async function enrichLeadFree(input: {
  empresa: string;
  website: string | null;
  linkedin: string | null;
  site_confirmado: boolean;
  extraText?: string;
  cnpjHint?: string | null;
}): Promise<{
  site_confirmado: boolean;
  linkedin: string | null;
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
  contatos: ClassifiedContact[];
  whatsapp: string | null;
  telefone_fixo: string | null;
  telefone_comercial: string | null;
  sac: string | null;
}> {
  const started = Date.now();
  let site_confirmado = input.site_confirmado;
  let linkedin = input.linkedin;
  let scraped_used = false;
  let pageText = input.extraText ?? "";
  let emails: string[] = [];
  let telefones: string[] = [];
  let produtos: string[] = [];
  let servicos: string[] = [];
  let resumo_site = "";
  let contatos: ClassifiedContact[] = [];
  let whatsapp: string | null = null;
  let telefone_fixo: string | null = null;
  let telefone_comercial: string | null = null;
  let sac: string | null = null;
  const cnpjCandidates: string[] = [];

  if (input.cnpjHint) {
    const d = onlyDigitsCnpj(input.cnpjHint);
    if (isValidCnpjFormat(d)) cnpjCandidates.push(d);
  }

  if (input.website) {
    try {
      const scraped = await scrapeSite(input.website, { company: input.empresa });
      scraped_used = true;
      if (scraped.ok) {
        if (!site_confirmado) site_confirmado = true;
        pageText = `${pageText}\n${scraped.markdown}`;
        resumo_site = scraped.markdown.slice(0, 800);
        emails = scraped.emails;
        telefones = scraped.telefones;
        produtos = scraped.produtos;
        servicos = scraped.servicos;
        contatos = scraped.contatos ?? [];
        whatsapp = scraped.whatsapp ?? null;
        telefone_fixo = scraped.telefone_fixo ?? null;
        telefone_comercial = scraped.telefone_comercial ?? null;
        sac = scraped.sac ?? null;
        if (!linkedin && scraped.linkedin) linkedin = scraped.linkedin;
        cnpjCandidates.push(...scraped.cnpjCandidates);
      }
    } catch (e) {
      // Fallback: continua sem scraping — nunca deve derrubar o enriquecimento
      console.warn(`[enrichLeadFree] scrape falhou p/ ${input.empresa}:`, e);
    }
  }

  cnpjCandidates.push(...extractCnpjsFromText(pageText));
  cnpjCandidates.push(...extractCnpjsFromText(input.empresa));

  const uniqueCnpjs = [...new Set(cnpjCandidates)].slice(0, 3);
  let cnpjData: CnpjData | null = null;
  for (const cand of uniqueCnpjs) {
    try {
      cnpjData = await lookupCnpj(cand);
      if (cnpjData) break;
    } catch {
      /* segue tentando */
    }
  }

  console.log(
    `[enrich] ${JSON.stringify({
      empresa: input.empresa,
      ms: Date.now() - started,
      scraped_used,
      site_confirmado,
      cnpj_found: Boolean(cnpjData),
    })}`,
  );

  return {
    site_confirmado,
    linkedin: linkedin ?? null,
    cnpj: cnpjData?.cnpj ?? null,
    razao_social: cnpjData?.razao_social ?? null,
    nome_fantasia: cnpjData?.nome_fantasia ?? null,
    cnae: cnpjData?.cnae ?? null,
    cnae_descricao: cnpjData?.cnae_descricao ?? null,
    porte_oficial: cnpjData?.porte_oficial ?? null,
    situacao: cnpjData?.situacao ?? null,
    municipio: cnpjData?.municipio ?? null,
    capital_social: cnpjData?.capital_social ?? null,
    fonte_enriquecimento: cnpjData?.fonte ?? (scraped_used && site_confirmado ? "scrape" : null),
    emails,
    telefones,
    produtos,
    servicos,
    resumo_site,
    contatos,
    whatsapp,
    telefone_fixo,
    telefone_comercial,
    sac,
  };
}
