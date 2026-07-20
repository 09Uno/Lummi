import * as React from "react";
import { cn } from "@/lib/utils";

type BadgeVariant = "default" | "accent" | "success" | "warning" | "danger";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

const variantMap: Record<BadgeVariant, string> = {
  default: "lf-chip",
  accent: "lf-chip lf-chip-accent",
  success: "lf-chip lf-chip-success",
  warning: "lf-chip lf-chip-warning",
  danger: "lf-chip lf-chip-danger",
};

export function Badge({ className, variant = "default", children, ...props }: BadgeProps) {
  return (
    <span className={cn(variantMap[variant], className)} {...props}>
      {children}
    </span>
  );
}
