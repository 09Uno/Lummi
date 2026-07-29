import { ExternalLink, Linkedin, Building2, GripVertical, Users } from "lucide-react";
import type { CrmLead } from "@/lib/crm/types";
import { CRM_STATUS_META } from "@/lib/crm/types";

type Props = {
  lead: CrmLead;
  onDragStart: (e: React.DragEvent, lead: CrmLead) => void;
  onClick?: (lead: CrmLead) => void;
  /** Nº de tomadores de decisão já encontrados para este lead (opcional). */
  decisionMakersCount?: number;
};

export function KanbanCard({ lead, onDragStart, onClick, decisionMakersCount }: Props) {
  const meta = CRM_STATUS_META[lead.status];

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, lead)}
      onClick={() => onClick?.(lead)}
      className="group cursor-grab active:cursor-grabbing rounded-xl border border-[var(--cy-card-border)] bg-[var(--cy-input-bg)] p-3 shadow-sm transition hover:border-[var(--cy-card-border)] hover:bg-[var(--cy-surface-hover)]"
    >
      <div className="flex items-start gap-2">
        <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-[var(--cy-muted)] opacity-0 group-hover:opacity-100 transition" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Building2 className="h-3.5 w-3.5 shrink-0 text-[var(--cy-muted)]" />
            <p className="truncate text-sm font-medium text-[var(--cy-content-ink)]">
              {lead.organization}
            </p>
          </div>

          {(lead.segment || lead.uf) && (
            <p className="mt-1 truncate text-xs text-[var(--cy-muted)]">
              {[lead.segment, lead.uf].filter(Boolean).join(" · ")}
            </p>
          )}

          {lead.fit && (
            <p className="mt-1.5 line-clamp-2 text-xs text-[var(--cy-muted)] leading-relaxed">
              {lead.fit}
            </p>
          )}

          <div className="mt-2 flex items-center gap-2">
            {lead.confianca && (
              <span
                className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold"
                style={{
                  background:
                    lead.confianca === "alta"
                      ? "rgba(39,166,68,0.15)"
                      : lead.confianca === "media"
                        ? "rgba(245,166,35,0.15)"
                        : "rgba(138,143,152,0.15)",
                  color:
                    lead.confianca === "alta"
                      ? "#4ade80"
                      : lead.confianca === "media"
                        ? "#fbbf24"
                        : "#7FB0B4",
                }}
              >
                {lead.confianca}
              </span>
            )}
            {lead.cnpj && (
              <span className="text-[10px] text-[var(--cy-muted)] font-mono truncate max-w-[110px]">
                {lead.cnpj}
              </span>
            )}
            {typeof decisionMakersCount === "number" && decisionMakersCount > 0 && (
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold text-[var(--cy-muted)] bg-[var(--cy-surface-hover)]"
                title={`${decisionMakersCount} tomador${decisionMakersCount > 1 ? "es" : ""} de decisão encontrado${decisionMakersCount > 1 ? "s" : ""}`}
              >
                <Users className="h-3 w-3" />
                {decisionMakersCount}
              </span>
            )}
            <div className="ml-auto flex items-center gap-1">
              {lead.website && (
                <a
                  href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="rounded p-1 text-[var(--cy-muted)] hover:text-[#0F4C5C] hover:bg-[#1a5560]"
                  title="Website"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
              {lead.linkedin && (
                <a
                  href={lead.linkedin}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="rounded p-1 text-[var(--cy-muted)] hover:text-[#0F4C5C] hover:bg-[#1a5560]"
                  title="LinkedIn"
                >
                  <Linkedin className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
      {/* accent bar */}
      <div
        className="mt-2 h-0.5 w-full rounded-full opacity-60"
        style={{ background: meta.color }}
      />
    </div>
  );
}
