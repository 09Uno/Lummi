/**
 * LLM gateway — Perplexity Agent API only (LeadForge Insight + leads).
 *
 * Secrets (Lovable Cloud / server env):
 *   PERPLEXITY_API_KEY           — obrigatório
 *   PERPLEXITY_MODEL_LEADS       — opcional (default: google/gemini-3.1-flash-lite)
 *   PERPLEXITY_MODEL_DOSSIE      — opcional (default: anthropic/claude-haiku-4-5)
 *   PERPLEXITY_MODEL_DECISORES   — opcional (default: openai/gpt-5-mini)
 *
 * Endpoint único:
 *   POST https://api.perplexity.ai/v1/agent
 *
 * BUILD_STAMP=20260727-perplexity-only
 */

export const LEADFORGE_AI_BUILD = "20260727-perplexity-only";

const PERPLEXITY_AGENT_URL = "https://api.perplexity.ai/v1/agent";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Keys & default models
// ---------------------------------------------------------------------------

export function getPerplexityApiKey(): string {
  const key = process.env.PERPLEXITY_API_KEY?.trim() || "";
  if (!key) {
    throw new Error(
      `[LeadForge AI/${LEADFORGE_AI_BUILD}] Chave da Perplexity ausente. Defina PERPLEXITY_API_KEY nos Secrets do Lovable Cloud.`,
    );
  }
  return key;
}

/** @deprecated alias — prefer getPerplexityApiKey */
export function getLlmApiKey(): string {
  return getPerplexityApiKey();
}

export function getPerplexityModelLeads(): string {
  return process.env.PERPLEXITY_MODEL_LEADS?.trim() || "google/gemini-3.1-flash-lite";
}

export function getPerplexityModelDossie(): string {
  return process.env.PERPLEXITY_MODEL_DOSSIE?.trim() || "anthropic/claude-haiku-4-5";
}

export function getPerplexityModelDecisores(): string {
  return process.env.PERPLEXITY_MODEL_DECISORES?.trim() || "openai/gpt-5-mini";
}

/** @deprecated — use getPerplexityModelDossie */
export function getPerplexityModelId(): string {
  return getPerplexityModelDossie();
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PerplexityTool =
  | {
      type: "web_search";
      search_context_size?: "low" | "medium" | "high";
      max_tokens?: number;
      max_tokens_per_page?: number;
      max_results?: number;
      filters?: Record<string, unknown>;
    }
  | {
      type: "people_search";
      max_tokens?: number;
      max_tokens_per_page?: number;
      max_results_per_query?: number;
      max_results_per_request?: number;
    }
  | { type: "fetch_url" }
  | { type: "finance_search" }
  | { type: string; [key: string]: unknown };

type PerplexityAgentResponse = {
  id?: string;
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
    text?: string;
  }>;
  output_text?: string;
  error?: { message?: string; type?: string; code?: string };
  usage?: unknown;
};

export type CallPerplexityAgentOpts = {
  instructions: string;
  input: string;
  model?: string;
  maxSteps?: number;
  maxOutputTokens?: number;
  reasoningEffort?: "low" | "medium" | "high";
  tools?: PerplexityTool[];
  apiKey?: string;
};

// ---------------------------------------------------------------------------
// Response extraction
// ---------------------------------------------------------------------------

function extractPerplexityText(json: PerplexityAgentResponse): string {
  if (typeof json.output_text === "string" && json.output_text.trim()) {
    return json.output_text.trim();
  }
  const parts: string[] = [];
  for (const item of json.output ?? []) {
    if (item.type === "message" || !item.type) {
      if (typeof item.text === "string" && item.text.trim()) {
        parts.push(item.text.trim());
      }
      for (const c of item.content ?? []) {
        if (
          (c.type === "output_text" || c.type === "text" || !c.type) &&
          typeof c.text === "string" &&
          c.text.trim()
        ) {
          parts.push(c.text.trim());
        }
      }
    }
  }
  return parts.join("\n").trim();
}

// ---------------------------------------------------------------------------
// Core client
// ---------------------------------------------------------------------------

export async function callPerplexityAgent(opts: CallPerplexityAgentOpts): Promise<string> {
  const apiKey = opts.apiKey ?? getPerplexityApiKey();
  const model = opts.model ?? getPerplexityModelDossie();
  const maxSteps = opts.maxSteps ?? 5;
  const maxOutputTokens = opts.maxOutputTokens ?? 16000;
  const reasoningEffort = opts.reasoningEffort ?? "medium";
  const tools = opts.tools ?? [];

  console.log(
    `[LeadForge AI/${LEADFORGE_AI_BUILD}] Perplexity Agent model=${model} steps=${maxSteps} tools=${tools.map((t) => t.type).join(",") || "none"}`,
  );

  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const body: Record<string, unknown> = {
        model,
        instructions: opts.instructions,
        input: opts.input,
        max_steps: maxSteps,
        max_output_tokens: maxOutputTokens,
        reasoning: { effort: reasoningEffort },
      };

      if (tools.length > 0) {
        body.tools = tools;
      }

      const res = await fetch(PERPLEXITY_AGENT_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
      });

      const json = (await res.json()) as PerplexityAgentResponse;

      if (!res.ok || json.error) {
        const msg =
          json.error?.message ||
          `Perplexity HTTP ${res.status}${json.error?.type ? ` (${json.error.type})` : ""}`;
        lastError = new Error(`[LeadForge AI/${LEADFORGE_AI_BUILD}] ${msg} [${model}]`);
        console.warn(`[LeadForge AI/${LEADFORGE_AI_BUILD}] Perplexity falhou`, model, msg);

        if (res.status === 401 || res.status === 403) {
          throw lastError;
        }
        if ((res.status === 429 || res.status === 503) && attempt < 2) {
          await sleep(2000 * (attempt + 1));
          continue;
        }
        if (attempt < 2) {
          await sleep(1500 * (attempt + 1));
          continue;
        }
        break;
      }

      const text = extractPerplexityText(json);
      if (!text) {
        lastError = new Error(
          `[LeadForge AI/${LEADFORGE_AI_BUILD}] Resposta vazia da Perplexity Agent [${model}]`,
        );
        if (attempt < 2) {
          await sleep(1500 * (attempt + 1));
          continue;
        }
        break;
      }

      console.log(
        `[LeadForge AI/${LEADFORGE_AI_BUILD}] Perplexity Agent OK:`,
        model,
        `(${text.length} chars)`,
      );
      return text;
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (/401|403|Unauthorized|API key|PERMISSION|invalid/i.test(msg)) {
        throw lastError instanceof Error ? lastError : new Error(msg);
      }
      const retryable = /429|503|rate|quota|fetch|network|timeout|ECONNRESET/i.test(msg);
      if (!retryable || attempt === 2) break;
      await sleep(2000 * (attempt + 1));
    }
  }

  const detail = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(
    `[LeadForge AI/${LEADFORGE_AI_BUILD}] Falha ao contatar a Perplexity Agent API: ${detail}`,
  );
}

/**
 * Compatibilidade: curadoria de texto (leads) sem tools.
 */
export async function callLLM(opts: {
  prompt: string;
  temperature?: number;
  maxOutputTokens?: number;
  model?: string;
}): Promise<string> {
  return callPerplexityAgent({
    model: opts.model ?? getPerplexityModelLeads(),
    instructions:
      "Você é um analista de inteligência de mercado B2B. Siga as instruções do input à risca. Não invente absolutamente NADA. Retorne apenas o formato solicitado, sem markdown extra.",
    input: opts.prompt,
    maxSteps: 1,
    maxOutputTokens: opts.maxOutputTokens ?? 8000,
    reasoningEffort: "low",
    tools: [],
  });
}
