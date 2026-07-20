/**
 * Contrato mínimo de um provedor de CRM para o Lummi.
 * Foco atual: exportar empresas (upsert por domínio).
 */
export type CrmCompanyInput = {
  empresa: string;
  uf?: string | null;
  segmento?: string | null;
  fit?: string | null;
  website?: string | null;
  linkedin?: string | null;
  municipio?: string | null;
};

export type CrmExportResult = {
  empresa: string;
  status: "created" | "updated" | "failed";
  externalId?: string;
  error?: string;
};

export interface CrmProvider {
  exportCompany(company: CrmCompanyInput): Promise<CrmExportResult>;
}
