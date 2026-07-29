import { useState } from "react";
import { cn } from "@/lib/utils";

function getDomain(website: string): string {
  return website
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/\/.*$/, "")
    .trim();
}

function initials(name: string): string {
  const clean = name.trim();
  if (!clean) return "?";
  const parts = clean.split(/\s+/);
  if (parts.length === 1) return clean.slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function CompanyLogo({
  name,
  website,
  className,
}: {
  name: string;
  website: string;
  className?: string;
}) {
  const domain = getDomain(website);
  const [stage, setStage] = useState<0 | 1 | 2>(domain ? 0 : 2);

  const src =
    stage === 0
      ? `https://logo.clearbit.com/${domain}`
      : stage === 1
        ? `https://www.google.com/s2/favicons?domain=${domain}&sz=128`
        : "";

  if (stage === 2) {
    return (
      <div
        className={cn(
          "w-16 h-16 rounded-2xl flex items-center justify-center text-white font-extrabold text-xl shrink-0",
          "bg-gradient-to-br from-[#072A31] via-[#0F4C5C] to-[#2E7A85]",
          className,
        )}
      >
        {initials(name)}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "w-16 h-16 rounded-2xl bg-white border border-border flex items-center justify-center overflow-hidden shrink-0 shadow-sm",
        className,
      )}
    >
      <img
        src={src}
        alt={name}
        className="w-16 h-16 object-contain"
        onError={() => setStage((s) => (s === 0 ? 1 : 2))}
      />
    </div>
  );
}
