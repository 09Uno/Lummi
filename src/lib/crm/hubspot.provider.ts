import type { AuthProvider } from "./auth/auth-provider";
import type { CrmCompanyInput, CrmExportResult, CrmProvider } from "./provider";

const HUBSPOT_API_BASE = "https://api.hubapi.com";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function extractDomain(website: string | null | undefined): string | null {
  if (!website) return null;
  try {
    const withProtocol = /^https?:\/\//i.test(website.trim())
      ? website.trim()
      : `https://${website.trim()}`;
    const host = new URL(withProtocol).hostname.toLowerCase();
    return host.startsWith("www.") ? host.slice(4) : host || null;
  } catch {
    return null;
  }
}

function buildProperties(lead: CrmCompanyInput, domain: string | null): Record<string, string> {
  const descriptionParts: string[] = [];
  if (lead.fit) descriptionParts.push(lead.fit);
  if (lead.segmento) descriptionParts.push(`Segmento: ${lead.segmento}`);
  const description = descriptionParts.join(" — ");

  const properties: Record<string, string> = { name: lead.empresa };
  if (lead.website) properties.website = lead.website;
  if (domain) properties.domain = domain;
  if (lead.municipio) properties.city = lead.municipio;
  if (lead.uf) properties.state = lead.uf;
  if (description) properties.description = description;
  if (lead.linkedin) properties.linkedin_company_page = lead.linkedin;
  return properties;
}

/**
 * HubspotProvider — delega autenticação ao AuthProvider (Static/OAuth).
 * Nunca acessa process.env diretamente. Nunca lança para o frontend:
 * erros viram CrmExportResult com status="failed".
 */
export class HubspotProvider implements CrmProvider {
  constructor(private readonly auth: AuthProvider) {}

  private async request<T>(
    path: string,
    init: RequestInit,
    logCtx: { company?: string } = {},
  ): Promise<T> {
    const token = await this.auth.getAccessToken();
    let lastError: unknown;

    for (let attempt = 0; attempt < 3; attempt++) {
      const started = Date.now();
      let res: Response;
      try {
        res = await fetch(`${HUBSPOT_API_BASE}${path}`, {
          ...init,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            ...(init.headers ?? {}),
          },
          signal: AbortSignal.timeout(20_000),
        });
      } catch (e) {
        lastError = e;
        console.warn(
          `[hubspot] network_error ${JSON.stringify({
            path,
            company: logCtx.company,
            attempt,
            err: e instanceof Error ? e.message : String(e),
          })}`,
        );
        if (attempt < 2) {
          await sleep(500 * Math.pow(2, attempt));
          continue;
        }
        throw new Error(
          `Falha de rede ao contatar a HubSpot: ${e instanceof Error ? e.message : String(e)}`,
        );
      }

      const text = await res.text();
      let json: unknown = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        /* resposta não-JSON */
      }

      const ms = Date.now() - started;
      const remaining = res.headers.get("x-hubspot-ratelimit-remaining");
      console.log(
        `[hubspot] ${JSON.stringify({
          path,
          method: init.method ?? "GET",
          status: res.status,
          ms,
          rateLimitRemaining: remaining,
          company: logCtx.company,
        })}`,
      );

      if (res.status === 429) {
        console.warn(`[hubspot] rate_limited attempt=${attempt}`);
        if (attempt < 2) {
          await sleep(1000 * (attempt + 1));
          continue;
        }
      }

      if (res.ok) return json as T;

      const providerMsg =
        (json as { message?: string } | null)?.message ||
        `HubSpot HTTP ${res.status}: ${text.slice(0, 300)}`;

      if (res.status === 401) {
        console.error(`[hubspot] 401 unauthorized — token inválido/ausente`);
        throw new Error(
          "HubSpot rejeitou o token (401). Confirme que HUBSPOT_ACCESS_TOKEN é um Private App Token válido com escopos crm.objects.companies.read e .write.",
        );
      }
      if (res.status === 403) {
        console.error(`[hubspot] 403 forbidden — escopo faltando: ${providerMsg}`);
        throw new Error(
          `HubSpot: permissão insuficiente (403). Ative os escopos crm.objects.companies.read e .write no Private App. Detalhe: ${providerMsg}`,
        );
      }

      lastError = new Error(providerMsg);
      if (attempt < 2 && res.status >= 500) {
        await sleep(1000 * (attempt + 1));
        continue;
      }
      throw lastError;
    }

    throw lastError instanceof Error ? lastError : new Error("Falha ao contatar a HubSpot");
  }

  private async findCompanyIdByDomain(domain: string, company?: string): Promise<string | null> {
    const json = await this.request<{ results?: Array<{ id?: string }> } | null>(
      `/crm/v3/objects/companies/search`,
      {
        method: "POST",
        body: JSON.stringify({
          filterGroups: [
            {
              filters: [{ propertyName: "domain", operator: "EQ", value: domain }],
            },
          ],
          properties: ["name", "domain"],
          limit: 1,
        }),
      },
      { company },
    );
    return json?.results?.[0]?.id ?? null;
  }

  async exportCompany(lead: CrmCompanyInput): Promise<CrmExportResult> {
    try {
      const domain = extractDomain(lead.website);
      const properties = buildProperties(lead, domain);

      console.log(
        `[hubspot] export_start ${JSON.stringify({
          company: lead.empresa,
          domain,
          properties: Object.keys(properties),
        })}`,
      );

      const existingId = domain ? await this.findCompanyIdByDomain(domain, lead.empresa) : null;

      if (existingId) {
        await this.request(
          `/crm/v3/objects/companies/${existingId}`,
          { method: "PATCH", body: JSON.stringify({ properties }) },
          { company: lead.empresa },
        );
        return { empresa: lead.empresa, status: "updated", externalId: existingId };
      }

      const created = await this.request<{ id?: string } | null>(
        `/crm/v3/objects/companies`,
        { method: "POST", body: JSON.stringify({ properties }) },
        { company: lead.empresa },
      );
      return { empresa: lead.empresa, status: "created", externalId: created?.id };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[hubspot] export_failed ${JSON.stringify({ company: lead.empresa, error: message })}`,
      );
      return { empresa: lead.empresa, status: "failed", error: message };
    }
  }
}
