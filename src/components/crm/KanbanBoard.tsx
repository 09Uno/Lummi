import { useCallback, useMemo, useState } from "react";
import type { CrmLead, CrmStatus } from "@/lib/crm/types";
import { CRM_STATUSES } from "@/lib/crm/types";
import { KanbanColumn } from "./KanbanColumn";

type Props = {
  leads: CrmLead[];
  onMove: (id: string, status: CrmStatus, position: number) => Promise<void>;
  onCardClick?: (lead: CrmLead) => void;
};

export function KanbanBoard({ leads, onMove, onCardClick }: Props) {
  const [dragging, setDragging] = useState<CrmLead | null>(null);
  const [optimistic, setOptimistic] = useState<CrmLead[] | null>(null);

  const display = optimistic ?? leads;

  const byStatus = useMemo(() => {
    const map: Record<CrmStatus, CrmLead[]> = {
      new: [],
      contacted: [],
      nurture: [],
      qualified: [],
      lost: [],
    };
    for (const lead of display) {
      map[lead.status]?.push(lead);
    }
    for (const s of CRM_STATUSES) {
      map[s].sort((a, b) => a.position - b.position);
    }
    return map;
  }, [display]);

  const handleDragStart = useCallback((_e: React.DragEvent, lead: CrmLead) => {
    setDragging(lead);
  }, []);

  const handleDrop = useCallback(
    async (targetStatus: CrmStatus) => {
      if (!dragging) return;
      if (dragging.status === targetStatus) {
        setDragging(null);
        return;
      }

      const position = byStatus[targetStatus].length;
      const next = display.map((l) =>
        l.id === dragging.id ? { ...l, status: targetStatus, position } : l,
      );
      setOptimistic(next);
      setDragging(null);

      try {
        await onMove(dragging.id, targetStatus, position);
      } catch {
        setOptimistic(null);
      }
    },
    [dragging, byStatus, display, onMove],
  );

  // Sync when parent leads change
  if (optimistic && optimistic !== leads) {
    // clear optimistic after parent refresh — handled by key/effect in parent
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-4 px-1">
      {CRM_STATUSES.map((status) => (
        <KanbanColumn
          key={status}
          status={status}
          leads={byStatus[status]}
          onDragStart={handleDragStart}
          onDrop={handleDrop}
          onCardClick={onCardClick}
        />
      ))}
    </div>
  );
}
