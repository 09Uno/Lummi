/**
 * Google Gemini via REST API (no extra npm packages).
 * Works on Lovable with only GEMINI_API_KEY in Secrets.
 */

export function getGeminiApiKey(): string {
  const key =
    process.env.GEMINI_API_KEY?.trim() ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
    process.env.GOOGLE_API_KEY?.trim() ||
    "";
  if (!key) {
    throw new Error("Chave do Gemini ausente. Defina GEMINI_API_KEY nos Secrets do Lovable.");
  }
  return key;
}

/** Preferred model + fallbacks for API keys that can't access older IDs. */
const GEMINI_MODEL_CANDIDATES = [
  "gemini-3.5-flash",
  "gemini-3-flash-preview",
  "gemini-3-flash",
  "gemini-2.5-flash",
  "gemini-flash-latest",
] as const;

export function getGeminiModelId(): string {
  return process.env.GEMINI_MODEL?.trim() || GEMINI_MODEL_CANDIDATES[0];
}

function modelCandidates(preferred?: string): string[] {
  const primary = preferred?.trim() || getGeminiModelId();
  const rest = GEMINI_MODEL_CANDIDATES.filter((m) => m !== primary);
  return [primary, ...rest];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function isModelUnavailableError(msg: string): boolean {
  return /no longer available|not found|not supported|is not found|INVALID_ARGUMENT.*model/i.test(
    msg,
  );
}

/**
 * Calls Gemini generateContent and returns the text response.
 * Retries on rate-limit / transient errors and falls back to newer model IDs.
 */
export async function callGemini(opts: {
  prompt: string;
  temperature?: number;
  apiKey?: string;
  model?: string;
}): Promise<string> {
  const apiKey = opts.apiKey ?? getGeminiApiKey();
  const temperature = opts.temperature ?? 0.2;
  const models = modelCandidates(opts.model);

  let lastError: unknown;

  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: opts.prompt }] }],
            generationConfig: { temperature },
          }),
          // Prompts longos (dossiê ~ 60s típ.). Sem signal, o worker Node
          // fica pendurado se o Gemini travar a conexão.
          signal: AbortSignal.timeout(90_000),
        });

        if (res.status === 429 || res.status === 503) {
          lastError = new Error(`Gemini HTTP ${res.status} (${model})`);
          if (attempt < 2) {
            await sleep(2000 * (attempt + 1));
            continue;
          }
          break;
        }

        const json = (await res.json()) as {
          error?: { message?: string; status?: string };
          candidates?: Array<{
            content?: { parts?: Array<{ text?: string }> };
            finishReason?: string;
          }>;
        };

        if (!res.ok) {
          const msg = json?.error?.message || `Gemini HTTP ${res.status}`;
          lastError = new Error(`${msg} [${model}]`);

          // Try next model if this ID is retired / unavailable for this key
          if (isModelUnavailableError(msg) || res.status === 404) {
            break;
          }

          // Invalid API key / permission — don't keep trying other models forever
          if (res.status === 401 || res.status === 403) {
            throw lastError;
          }

          if (attempt < 2) {
            await sleep(2000 * (attempt + 1));
            continue;
          }
          break;
        }

        const text = json?.candidates?.[0]?.content?.parts
          ?.map((p) => p.text ?? "")
          .join("")
          .trim();

        if (!text) {
          lastError = new Error(`Resposta vazia do Gemini [${model}]`);
          break;
        }
        return text;
      } catch (err) {
        lastError = err;
        const msg = err instanceof Error ? err.message : String(err);
        if (isModelUnavailableError(msg)) break;
        const retryable = /429|503|rate|quota|RESOURCE_EXHAUSTED|fetch|network/i.test(msg);
        if (!retryable || attempt === 2) break;
        await sleep(2000 * (attempt + 1));
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`Falha ao contatar o Gemini: ${String(lastError)}`);
}
