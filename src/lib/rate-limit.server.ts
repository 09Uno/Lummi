// Rate limiter em memória (fixed window). Roda dentro do processo Node do container.
// Serve pra chamadas caras (Gemini + scraping): impede um usuário sozinho de estourar
// quota / custo. Como o Lummi sobe como 1 container único na VPS, memória local basta.
// Se um dia virar N réplicas, trocar por Redis (ou coalescer via reverse-proxy).

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

function cleanup() {
  const now = Date.now();
  for (const [key, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(key);
  }
}

// Passada preguiçosa: só varre quando o Map começa a crescer.
setInterval(cleanup, 5 * 60_000).unref();

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  resetInMs: number;
};

/**
 * Consome 1 request para (userId, action). Retorna ok=false se ultrapassou.
 * limit = quantas requests, windowMs = janela em ms.
 */
export function checkRateLimit(
  userId: string,
  action: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const key = `${action}:${userId}`;
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, resetInMs: windowMs };
  }

  if (bucket.count >= limit) {
    return { ok: false, remaining: 0, resetInMs: bucket.resetAt - now };
  }

  bucket.count += 1;
  return { ok: true, remaining: limit - bucket.count, resetInMs: bucket.resetAt - now };
}

/** Mensagem amigável em pt-BR pro frontend. */
export function rateLimitMessage(result: RateLimitResult, action: string): string {
  const minutes = Math.ceil(result.resetInMs / 60_000);
  return `Limite atingido para ${action}. Tente de novo em ${minutes} min.`;
}
