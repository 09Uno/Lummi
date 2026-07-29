import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { importLeadsToCrm } from "@/lib/crm.functions";
import { Loader2, Upload, X, FileSpreadsheet, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Row = {
  organization: string;
  website?: string | null;
  email?: string | null;
  phone?: string | null;
  linkedin?: string | null;
  cnpj?: string | null;
  uf?: string | null;
  municipio?: string | null;
  industry?: string | null;
};

const REQUIRED = ["organization", "empresa", "company", "nome", "razão social", "razao social"];

function parseCsv(text: string): string[][] {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((l) => l.trim());
  return lines.map((line) => {
    const cells: string[] = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQ = !inQ;
        continue;
      }
      if (ch === "," && !inQ) {
        cells.push(cur.trim());
        cur = "";
        continue;
      }
      cur += ch;
    }
    cells.push(cur.trim());
    return cells;
  });
}

function mapHeader(h: string): string | null {
  const k = h
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
  const map: Record<string, string> = {
    organization: "organization",
    empresa: "organization",
    company: "organization",
    nome: "organization",
    "razao social": "organization",
    website: "website",
    site: "website",
    url: "website",
    email: "email",
    e_mail: "email",
    telefone: "phone",
    phone: "phone",
    celular: "phone",
    linkedin: "linkedin",
    cnpj: "cnpj",
    uf: "uf",
    estado: "uf",
    cidade: "municipio",
    municipio: "municipio",
    industry: "industry",
    setor: "industry",
    segmento: "industry",
  };
  return map[k] ?? null;
}

function rowsFromTable(table: string[][]): { rows: Row[]; errors: string[] } {
  if (table.length < 2) return { rows: [], errors: ["Planilha vazia ou sem cabeçalho."] };
  const headers = table[0].map(mapHeader);
  if (!headers.some((h) => h === "organization")) {
    return {
      rows: [],
      errors: ["Coluna obrigatória ausente: organization / empresa / company / nome."],
    };
  }
  const errors: string[] = [];
  const rows: Row[] = [];
  table.slice(1).forEach((cells, idx) => {
    const obj: Record<string, string> = {};
    headers.forEach((key, i) => {
      if (key && cells[i]) obj[key] = cells[i];
    });
    if (!obj.organization) {
      errors.push(`Linha ${idx + 2}: empresa vazia — ignorada.`);
      return;
    }
    rows.push({
      organization: obj.organization,
      website: obj.website || null,
      email: obj.email || null,
      phone: obj.phone || null,
      linkedin: obj.linkedin || null,
      cnpj: obj.cnpj || null,
      uf: obj.uf || null,
      municipio: obj.municipio || null,
      industry: obj.industry || null,
    });
  });
  return { rows, errors };
}

export function LeadImportModal({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone?: () => void;
}) {
  const importFn = useServerFn(importLeadsToCrm);
  const [preview, setPreview] = useState<Row[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [fileName, setFileName] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canImport = preview.length > 0 && !loading;

  async function onFile(file: File) {
    setResult(null);
    setError(null);
    setFileName(file.name);
    const text = await file.text();
    // XLSX binary won't parse as CSV — instruct user
    if (file.name.toLowerCase().endsWith(".xlsx") || file.name.toLowerCase().endsWith(".xls")) {
      setPreview([]);
      setParseErrors([
        "Por enquanto envie CSV (exporte o Excel como CSV). Suporte nativo a .xlsx em breve.",
      ]);
      return;
    }
    const table = parseCsv(text);
    const { rows, errors } = rowsFromTable(table);
    setPreview(rows.slice(0, 50));
    setParseErrors(errors);
  }

  async function confirm() {
    if (!preview.length) return;
    setLoading(true);
    setError(null);
    try {
      const res = await importFn({
        data: {
          leads: preview.map((r) => ({
            ...r,
            source: "import" as const,
            status: "novo" as const,
          })),
        },
      });
      const created = (res as { created?: number; updated?: number }).created ?? preview.length;
      const updated = (res as { updated?: number }).updated ?? 0;
      setResult(`Importação concluída: ${created} novo(s), ${updated} atualizado(s).`);
      onDone?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha na importação");
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/45" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-auto rounded-2xl bg-[var(--cy-card)] border border-[var(--cy-card-border)] shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--cy-card-border)]">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-[#2E7A85]" />
            <h2 className="font-bold text-[var(--cy-content-ink)]">Importar leads</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 rounded-lg hover:bg-black/5 inline-flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm text-[var(--cy-muted)]">
            Envie um CSV com coluna obrigatória <strong>empresa</strong> (ou organization/company).
            Opcionais: website, email, telefone, linkedin, cnpj, uf, cidade, setor.
          </p>

          <label className="flex flex-col items-center justify-center gap-2 h-28 rounded-xl border-2 border-dashed border-[var(--cy-card-border)] cursor-pointer hover:border-[#2E7A85] transition">
            <Upload className="w-5 h-5 text-[#2E7A85]" />
            <span className="text-xs font-semibold text-[var(--cy-muted)]">
              {fileName || "Clique para selecionar CSV"}
            </span>
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onFile(f);
              }}
            />
          </label>

          {parseErrors.length > 0 && (
            <ul className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1">
              {parseErrors.slice(0, 8).map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}

          {preview.length > 0 && (
            <div className="overflow-auto max-h-48 rounded-xl border border-[var(--cy-card-border)]">
              <table className="w-full text-xs">
                <thead className="bg-black/5 sticky top-0">
                  <tr>
                    <th className="text-left p-2">Empresa</th>
                    <th className="text-left p-2">Website</th>
                    <th className="text-left p-2">E-mail</th>
                    <th className="text-left p-2">UF</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((r, i) => (
                    <tr key={i} className="border-t border-[var(--cy-card-border)]">
                      <td className="p-2 font-medium">{r.organization}</td>
                      <td className="p-2 text-[var(--cy-muted)]">{r.website || "—"}</td>
                      <td className="p-2 text-[var(--cy-muted)]">{r.email || "—"}</td>
                      <td className="p-2 text-[var(--cy-muted)]">{r.uf || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {result && (
            <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl p-3">
              <CheckCircle2 className="w-4 h-4" /> {result}
            </div>
          )}
          {error && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="h-10 px-4 rounded-xl text-sm font-semibold border border-[var(--cy-card-border)]"
            >
              Fechar
            </button>
            <button
              type="button"
              disabled={!canImport}
              onClick={() => void confirm()}
              className={cn(
                "h-10 px-4 rounded-xl text-sm font-bold text-white bg-[#0F4C5C] hover:bg-[#2E7A85] transition inline-flex items-center gap-2",
                !canImport && "opacity-50 cursor-not-allowed",
              )}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Confirmar importação ({preview.length})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
