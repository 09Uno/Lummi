import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "./LeadButton";
import { SearchX } from "lucide-react";

interface EmptyStateProps {
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  title = "Nenhum lead encontrado",
  description = "Ajuste os filtros de ICP ou tente um setor/UF diferente.",
  actionLabel = "Nova busca",
  onAction,
  icon,
  className,
}: EmptyStateProps) {
  return (
    <div className={cn("lf-empty", className)}>
      <div className="text-lf-ink-faint">{icon || <SearchX size={40} strokeWidth={1.5} />}</div>
      <div className="space-y-1">
        <h3 className="text-sm font-medium text-lf-ink">{title}</h3>
        <p className="text-xs text-lf-ink-subtle max-w-[280px]">{description}</p>
      </div>
      {onAction && (
        <Button variant="secondary" size="sm" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
