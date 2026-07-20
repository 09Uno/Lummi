import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "./LeadButton";
import { Search, Sparkles } from "lucide-react";

interface HeroToolProps {
  title?: string;
  description?: string;
  onSearch?: () => void;
  children?: React.ReactNode; // filters / form
  className?: string;
}

export function HeroTool({
  title = "Prospecção inteligente",
  description = "Defina o ICP, escolha UF ou Brasil Todo e deixe a IA curar os melhores leads com fit, site e LinkedIn.",
  onSearch,
  children,
  className,
}: HeroToolProps) {
  return (
    <div className={cn("lf-hero-tool", className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Sparkles size={16} className="text-[var(--lf-accent)]" />
            <h1>{title}</h1>
          </div>
          <p>{description}</p>
        </div>
        {onSearch && (
          <Button onClick={onSearch} leftIcon={<Search size={14} />}>
            Buscar leads
          </Button>
        )}
      </div>

      {children && <div className="mt-2 pt-3 border-t border-[var(--lf-border)]">{children}</div>}
    </div>
  );
}
