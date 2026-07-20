import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { StaticTokenAuthProvider } from "./crm/auth/static-token.provider";
import { HubspotProvider } from "./crm/hubspot.provider";
import type { CrmExportResult } from "./crm/provider";

/**
 * MVP: usa exclusivamente HUBSPOT_ACCESS_TOKEN (Private App).
 * Arquitetura preparada para trocar por OAuthAuthProvider sem refactor.
 */
function buildHubspotProvider(): { provider: HubspotProvider | null; error: string | null } {
  const token = process.env.HUBSPOT_ACCESS_TOKEN?.trim();
  if (!token) {
    console.error(`[hubspot] HUBSPOT_ACCESS_TOKEN ausente`);
    return {
      provider: null,
      error: "HubSpot não configurado. Configure HUBSPOT_ACCESS_TOKEN nas variáveis de ambiente.",
    };
  }
  const auth = new StaticTokenAuthProvider(token);
  return { provider: new HubspotProvider(auth), error: null };
}

const LeadForHubspotSchema = z.object({
  empresa: z.string().min(1),
  uf: z.string().nullable().optional(),
  segmento: z.string().nullable().optional(),
  fit: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  linkedin: z.string().nullable().optional(),
  municipio: z.string().nullable().optional(),
});

export type HubspotLeadResult = {
  empresa: string;
  status: "created" | "updated" | "failed";
  hubspotId?: string;
  error?: string;
};

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

const InputSchema = z.object({
  leads: z.array(LeadForHubspotSchema).min(1).max(50),
});

function toLegacyResult(r: CrmExportResult): HubspotLeadResult {
  return {
    empresa: r.empresa,
    status: r.status,
    hubspotId: r.externalId,
    error: r.error,
  };
}

export const exportLeadsToHubspot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const { provider, error } = buildHubspotProvider();

    // Erro amigável — NUNCA lança para o frontend
    if (!provider) {
      const failed: HubspotLeadResult[] = data.leads.map((l) => ({
        empresa: l.empresa,
        status: "failed",
        error: error ?? "HubSpot indisponível",
      }));
      return {
        results: failed,
        summary: { total: failed.length, created: 0, updated: 0, failed: failed.length },
        error: error ?? "HubSpot indisponível",
      };
    }

    const raw = await mapWithConcurrency(data.leads, 4, (lead) =>
      provider.exportCompany({
        empresa: lead.empresa,
        uf: lead.uf ?? null,
        segmento: lead.segmento ?? null,
        fit: lead.fit ?? null,
        website: lead.website ?? null,
        linkedin: lead.linkedin ?? null,
        municipio: lead.municipio ?? null,
      }),
    );
    const results = raw.map(toLegacyResult);

    const summary = {
      total: results.length,
      created: results.filter((r) => r.status === "created").length,
      updated: results.filter((r) => r.status === "updated").length,
      failed: results.filter((r) => r.status === "failed").length,
    };

    return { results, summary, error: null as string | null };
  });
