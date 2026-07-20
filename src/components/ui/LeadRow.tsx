import * as React from "react";
import { cn } from "@/lib/utils";
import { Badge } from "./LeadBadge";
import { Button } from "./LeadButton";
import { ExternalLink, Linkedin, MoreHorizontal, Star } from "lucide-react";

interface LeadRowProps {
  company: string;
  sector?: string;
  location?: string; // UF or city
  size?: string; // e.g. "11-50"
  fitScore?: number; // 0-100
  website?: string | null;
  linkedin?: string | null;
  isFavorite?: boolean;
  onClick?: () => void;
  onFavorite?: () => void;
  className?: string;
}

export function LeadRow({
  company,
  sector,
  location,
  size,
  fitScore = 0,
  website,
  linkedin,
  isFavorite,
  onClick,
  onFavorite,
  className,
}: LeadRowProps) {
  const initials = company
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  const fitVariant = fitScore >= 80 ? "success" : fitScore >= 60 ? "accent" : "default";

  return (
    <div className={cn("lf-lead-row", className)} onClick={onClick} role="button" tabIndex={0}>
      {/* Avatar */}
      <div className="lf-avatar">{initials}</div>

      {/* Name + meta */}
      <div className="min-w-0 flex flex-col gap-0.5">
        <div className="lf-name">{company}</div>
        <div className="lf-meta flex items-center gap-2">
          {sector && <span>{sector}</span>}
          {location && (
            <>
              <span className="opacity-40">·</span>
              <span>{location}</span>
            </>
          )}
          {size && (
            <>
              <span className="opacity-40">·</span>
              <span>{size} func.</span>
            </>
          )}
        </div>
      </div>

      {/* Fit score */}
      <Badge variant={fitVariant}>{fitScore}% fit</Badge>

      {/* Quick links */}
      <div className="flex items-center gap-1">
        {website && (
          <a
            href={website}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="lf-btn lf-btn-ghost lf-btn-icon"
            title="Website"
          >
            <ExternalLink size={14} />
          </a>
        )}
        {linkedin && (
          <a
            href={linkedin}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="lf-btn lf-btn-ghost lf-btn-icon"
            title="LinkedIn"
          >
            <Linkedin size={14} />
          </a>
        )}
      </div>

      {/* Actions (appear on hover) */}
      <div className="lf-actions">
        <Button
          variant="ghost"
          size="icon"
          onClick={(e) => {
            e.stopPropagation();
            onFavorite?.();
          }}
          title={isFavorite ? "Remover favorito" : "Favoritar"}
        >
          <Star
            size={14}
            fill={isFavorite ? "currentColor" : "none"}
            className={isFavorite ? "text-yellow-400" : ""}
          />
        </Button>
        <Button variant="ghost" size="icon" title="Mais">
          <MoreHorizontal size={14} />
        </Button>
      </div>
    </div>
  );
}
