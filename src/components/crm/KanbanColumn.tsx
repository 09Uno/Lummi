import type { CrmLead, CrmStatus } from "@/lib/crm/types";
import { CRM_STATUS_META } from "@/lib/crm/types";
import { KanbanCard } from "./KanbanCard";

type Props = {
  status: CrmStatus;
  leads: CrmLead[];
  onDragStart: (e: React.DragEvent, lead: CrmLead) => void;
  onDrop: (status: CrmStatus) => void;
  onCardClick?: (lead: CrmLead) => void;
};

export function KanbanColumn({ status, leads, onDragStart, onDrop, onCardClick }: Props) {
  const meta = CRM_STATUS_META[status];

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    onDrop(status);
  }

  return (
    <div
      className="flex w-[280px] shrink-0 flex-col rounded-2xl border border-[var(--cy-card-border)]"
      style={{ background: meta.columnBg }}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div className="flex items-center gap-2 border-b border-[var(--cy-card-border)] px-3 py-2.5">
        <span className="h-2 w-2 rounded-full" style={{ background: meta.color }} />
        <h3 className="text-sm font-semibold text-[var(--cy-content-ink)]">{meta.label}</h3>
        <span className="ml-auto rounded-full bg-[var(--cy-surface-hover)] px-2 py-0.5 text-[11px] font-medium text-[var(--cy-muted)]">
          {leads.length}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-2 min-h-[120px] max-h-[calc(100vh-220px)]">
        {leads.length === 0 ? (
          <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-[var(--cy-card-border)] p-4 text-center text-xs text-[var(--cy-muted)]">
            Arraste leads para cá
          </div>
        ) : (
          leads.map((lead) => (
            <KanbanCard key={lead.id} lead={lead} onDragStart={onDragStart} onClick={onCardClick} />
          ))
        )}
      </div>
    </div>
  );
}
