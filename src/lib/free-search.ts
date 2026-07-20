/**
 * Free web search + result harvesting (no API keys).
 * Strategies:
 *  1) DuckDuckGo HTML
 *  2) Bing HTML (fallback)
 * Primary discovery source; Claude curates the raw hits into leads.
 */
import { createHash } from "crypto";

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

function generateVariedQueries(opts: {
  sector: string;
  location: string;
  porte: string;
  oQueVende: string;
}): string[] {
  const today = new Date().toISOString().split("T")[0];
  const seed = parseInt(createHash("md5").update(today).digest("hex").slice(0, 8), 16);
  const rng = new SeededRandom(seed);
  const { sector, location, porte, oQueVende } = opts;

  const queryPatterns = [
    `${sector} ${location} site oficial`,
    `"${sector}" ${location} empresa oficial`,
    `${sector} ${location} .com.br`,
    `melhores ${sector} ${location}`,
    `top 10 ${sector} ${location}`,
    `ranking ${sector} ${location}`,
    `lista ${sector} ${location}`,
    `cadastro ${sector} ${location}`,
    `diretório ${sector} ${location}`,
    `${sector} em ${location}`,
    `${oQueVende} ${location}`,
    `empresas que vendem ${oQueVende} ${location}`,
    `"${oQueVende}" ${location}`,
    `${sector} ${porte} ${location}`,
    `${sector} ${location} contratando`,
    `${sector} ${location} vagas`,
    `${sector} companies ${location} Brazil`,
    `${sector} providers ${location}`,
    `${sector} services ${location} Brazil`,
    `${sector} market ${location}`,
  ];

  return queryPatterns
    .map((q) => ({ q, sort: rng.call() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ q }) => q)
    .slice(0, 5);
}

export type FreeSearchHit = {
  title: string;
  url: string;
  snippet: string;
  source: "duckduckgo" | "bing";
};

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeBasicEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function normalizeUrl(raw: string): string | null {
  try {
    let u = raw.trim();
    // DuckDuckGo redirect: //duckduckgo.com/l/?uddg=https%3A%2F%2F...
    if (u.includes("uddg=")) {
      const m = u.match(/uddg=([^&]+)/);
      if (m) u = decodeURIComponent(m[1]);
    }
    if (u.startsWith("//")) u = "https:" + u;
    if (!/^https?:\/\//i.test(u)) return null;
    const parsed = new URL(u);
    // Skip search engines / social noise for company discovery
    const host = parsed.hostname.replace(/^www\./, "");
    const block = [
      "duckduckgo.com",
      "google.com",
      "google.com.br",
      "bing.com",
      "youtube.com",
      "facebook.com",
      "instagram.com",
      "twitter.com",
      "x.com",
      "wikipedia.org",
      "//play.google.com",
    ];
    if (block.some((b) => host.includes(b))) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

/** DuckDuckGo HTML search (no key) */
async function searchDuckDuckGo(query: string, limit: number): Promise<FreeSearchHit[]> {
  const hits: FreeSearchHit[] = [];
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return hits;
    const html = await res.text();

    // Result blocks: class result / result__a / result__snippet
    const resultBlocks = html.split(/class="result(?:\s|")/);
    for (const block of resultBlocks.slice(1)) {
      if (hits.length >= limit) break;

      const linkMatch =
        block.match(/class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i) ||
        block.match(/href="(https?:\/\/[^"]+)"[^>]*class="result__a"[^>]*>([\s\S]*?)<\/a>/i) ||
        block.match(/uddg=([^&"]+)[^"]*"[^>]*>([\s\S]*?)<\/a>/i);

      let href = linkMatch?.[1] ?? "";
      const title = stripTags(linkMatch?.[2] ?? "");

      if (href.includes("uddg=")) {
        const m = href.match(/uddg=([^&]+)/);
        if (m) href = decodeURIComponent(m[1]);
      } else if (href.startsWith("//duckduckgo.com/l/?")) {
        const m = href.match(/uddg=([^&]+)/);
        if (m) href = decodeURIComponent(m[1]);
      }

      const snipMatch =
        block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|td|div)/i) ||
        block.match(/class="result__snippet"[^>]*>([\s\S]*?)</i);
      const snippet = stripTags(snipMatch?.[1] ?? "");

      const cleanUrl = normalizeUrl(decodeBasicEntities(href));
      if (!cleanUrl || !title || title.length < 3) continue;

      hits.push({
        title: decodeBasicEntities(title).slice(0, 200),
        url: cleanUrl,
        snippet: snippet.slice(0, 400),
        source: "duckduckgo",
      });
    }

    // Fallback regex if structure changed
    if (hits.length === 0) {
      const re = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
      let m: RegExpExecArray | null;
      while ((m = re.exec(html)) && hits.length < limit) {
        const cleanUrl = normalizeUrl(decodeBasicEntities(m[1]));
        const title = stripTags(m[2]);
        if (!cleanUrl || !title) continue;
        hits.push({
          title: title.slice(0, 200),
          url: cleanUrl,
          snippet: "",
          source: "duckduckgo",
        });
      }
    }
  } catch {
    // ignore
  }
  return hits;
}

/** Bing HTML search (no key) — fallback */
async function searchBing(query: string, limit: number): Promise<FreeSearchHit[]> {
  const hits: FreeSearchHit[] = [];
  try {
    const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&setlang=pt-BR&cc=BR`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "text/html",
        "Accept-Language": "pt-BR,pt;q=0.9",
      },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return hits;
    const html = await res.text();

    // Bing organic: <li class="b_algo"> ... <h2><a href="...">title</a></h2> ... <p> or .b_caption
    const blocks = html.split(/class="b_algo"/);
    for (const block of blocks.slice(1)) {
      if (hits.length >= limit) break;
      const aMatch = block.match(/<h2[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
      if (!aMatch) continue;
      const cleanUrl = normalizeUrl(decodeBasicEntities(aMatch[1]));
      const title = stripTags(aMatch[2]);
      const snipMatch =
        block.match(/class="b_caption"[^>]*>[\s\S]*?<p>([\s\S]*?)<\/p>/i) ||
        block.match(/<p>([\s\S]*?)<\/p>/i);
      const snippet = stripTags(snipMatch?.[1] ?? "");
      if (!cleanUrl || !title || title.length < 3) continue;
      hits.push({
        title: title.slice(0, 200),
        url: cleanUrl,
        snippet: snippet.slice(0, 400),
        source: "bing",
      });
    }
  } catch {
    // ignore
  }
  return hits;
}

function dedupeHits(hits: FreeSearchHit[]): FreeSearchHit[] {
  const seen = new Set<string>();
  const out: FreeSearchHit[] = [];
  for (const h of hits) {
    let host = "";
    try {
      host = new URL(h.url).hostname.replace(/^www\./, "");
    } catch {
      continue;
    }
    const key = host + "|" + h.title.toLowerCase().slice(0, 40);
    if (seen.has(key) || seen.has(host)) continue;
    seen.add(key);
    seen.add(host);
    out.push(h);
  }
  return out;
}

/**
 * Multi-query free search optimized for BR B2B company discovery.
 */
export async function freeCompanySearch(opts: {
  microSetor: string;
  macroSetor: string;
  estadosLabel: string;
  porte: string;
  oQueVende: string;
  limit?: number;
}): Promise<FreeSearchHit[]> {
  const limit = opts.limit ?? 25;
  const loc = opts.estadosLabel;
  const sector = opts.microSetor || opts.macroSetor;

  const queries = generateVariedQueries({
    sector,
    location: loc,
    porte: opts.porte,
    oQueVende: opts.oQueVende,
  });

  const all: FreeSearchHit[] = [];

  // Run first 3 queries in parallel (DDG), then fill with Bing if needed
  const ddgResults = await Promise.all(
    queries.slice(0, 3).map((q) => searchDuckDuckGo(q, Math.ceil(limit / 2))),
  );
  for (const batch of ddgResults) all.push(...batch);

  let merged = dedupeHits(all);

  if (merged.length < Math.min(12, limit)) {
    const bingBatch = await Promise.all(
      queries.slice(0, 2).map((q) => searchBing(q, Math.ceil(limit / 2))),
    );
    for (const batch of bingBatch) all.push(...batch);
    merged = dedupeHits(all);
  }

  return merged.slice(0, limit);
}

/** Format free hits as raw text for the Claude curation prompt */
export function freeHitsToRawText(hits: FreeSearchHit[]): string {
  if (!hits.length) return "Nenhum resultado bruto encontrado nas buscas gratuitas.";
  return hits
    .map((h, i) => `#${i + 1} ${h.title}\nURL: ${h.url}\n${h.snippet}\nFonte: ${h.source}`)
    .join("\n\n---\n\n");
}
