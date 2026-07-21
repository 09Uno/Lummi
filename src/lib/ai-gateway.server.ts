/**
 * Anthropic Claude via REST API (sem SDK — evita deps extras).
 * Preserva a mesma estrutura que existia com Gemini: fallback de modelos,
 * retry em 429/503/529, timeout via AbortSignal, mensagens amigáveis.
 */

export function getClaudeApiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY?.trim() || process.env.CLAUDE_API_KEY?.trim() || "";
  if (!key) {
    throw new Error("Chave da Anthropic ausente. Defina ANTHROPIC_API_KEY no .env.");
  }
  return key;
}

/** Modelo preferido + fallbacks para o caso do principal estar indisponível. */
const CLAUDE_MODEL_CANDIDATES = [
  "claude-sonnet-4-6",
  "claude-sonnet-4-5-20250929",
  "claude-haiku-4-5-20251001",
] as const;

export function getClaudeModelId(): string {
  return process.env.CLAUDE_MODEL?.trim() || CLAUDE_MODEL_CANDIDATES[0];
}

function modelCandidates(preferred?: string): string[] {
  const primary = preferred?.trim() || getClaudeModelId();
  const rest = CLAUDE_MODEL_CANDIDATES.filter((m) => m !== primary);
  return [primary, ...rest];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isModelUnavailableError(msg: string): boolean {
  return /not_found_error|model.*not.*found|model.*not.*available|invalid.*model/i.test(msg);
}

/**
 * Ferramenta server-side de web search da Anthropic. É executada pela própria API
 * — o modelo dispara buscas durante o turno e recebe os resultados sem round-trip.
 * Passamos como opção para não obrigar todo caller a usar.
 */
export interface ClaudeWebSearchTool {
  type: "web_search_20250305";
  name: "web_search";
  max_uses?: number;
  allowed_domains?: string[];
  blocked_domains?: string[];
}

/**
 * Chama Claude Messages API e retorna a string de texto.
 * Retry em rate limit / transient / overloaded (529) e fallback para modelos alternativos.
 * Se `tools` for informado, o modelo pode usá-las durante a resposta — extraímos apenas
 * os blocos `text` do content array final (ignora server_tool_use / web_search_tool_result).
 */
export async function callClaude(opts: {
  prompt: string;
  temperature?: number;
  apiKey?: string;
  model?: string;
  maxTokens?: number;
  tools?: ClaudeWebSearchTool[];
  timeoutMs?: number;
}): Promise<string> {
  const apiKey = opts.apiKey ?? getClaudeApiKey();
  const temperature = opts.temperature ?? 0.2;
  const maxTokens = opts.maxTokens ?? 8192;
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const models = modelCandidates(opts.model);

  let lastError: unknown;

  for (const model of models) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const body: Record<string, unknown> = {
          model,
          max_tokens: maxTokens,
          temperature,
          messages: [{ role: "user", content: opts.prompt }],
        };
        if (opts.tools?.length) body.tools = opts.tools;

        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify(body),
          // Dossiê com web search pode disparar múltiplas buscas antes da resposta final.
          // Sem signal, o worker Node fica pendurado se a Anthropic travar a conexão.
          signal: AbortSignal.timeout(timeoutMs),
        });

        // 429 rate limit, 503 unavailable, 529 overloaded
        if (res.status === 429 || res.status === 503 || res.status === 529) {
          lastError = new Error(`Claude HTTP ${res.status} (${model})`);
          if (attempt < 2) {
            await sleep(2000 * (attempt + 1));
            continue;
          }
          break;
        }

        const json = (await res.json()) as {
          error?: { message?: string; type?: string };
          content?: Array<{ type: string; text?: string }>;
          stop_reason?: string;
        };

        if (!res.ok) {
          const msg = json?.error?.message || `Claude HTTP ${res.status}`;
          lastError = new Error(`${msg} [${model}]`);

          // Modelo desativado / não encontrado — tenta o próximo da lista
          if (isModelUnavailableError(msg) || res.status === 404) {
            break;
          }

          // Chave inválida / sem permissão — não adianta tentar outros modelos
          if (res.status === 401 || res.status === 403) {
            throw lastError;
          }

          if (attempt < 2) {
            await sleep(2000 * (attempt + 1));
            continue;
          }
          break;
        }

        const text = json?.content
          ?.filter((c) => c.type === "text")
          .map((c) => c.text ?? "")
          .join("")
          .trim();

        if (!text) {
          lastError = new Error(`Resposta vazia do Claude [${model}]`);
          break;
        }
        return text;
      } catch (err) {
        lastError = err;
        const msg = err instanceof Error ? err.message : String(err);
        if (isModelUnavailableError(msg)) break;
        const retryable = /429|503|529|rate|quota|overloaded|fetch|network|timeout|aborted/i.test(
          msg,
        );
        if (!retryable || attempt === 2) break;
        await sleep(2000 * (attempt + 1));
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`Falha ao contatar Claude: ${String(lastError)}`);
}
