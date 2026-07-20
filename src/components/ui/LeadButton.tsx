import * as React from "react";
import { cn } from "@/lib/utils"; // assume you have cn helper (clsx + tailwind-merge)

type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg" | "icon";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const variantMap: Record<ButtonVariant, string> = {
  primary: "lf-btn lf-btn-primary",
  secondary: "lf-btn lf-btn-secondary",
  outline: "lf-btn lf-btn-outline",
  ghost: "lf-btn lf-btn-ghost",
  danger: "lf-btn lf-btn-danger",
};

const sizeMap: Record<ButtonSize, string> = {
  sm: "lf-btn-sm",
  md: "",
  lg: "lf-btn-lg",
  icon: "lf-btn-icon",
};

export function Button({
  className,
  variant = "primary",
  size = "md",
  loading = false,
  leftIcon,
  rightIcon,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(variantMap[variant], sizeMap[size], className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none">
          <circle
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="3"
            strokeOpacity="0.25"
          />
          <path
            d="M12 2a10 10 0 0 1 10 10"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
      ) : (
        leftIcon
      )}
      {children}
      {!loading && rightIcon}
    </button>
  );
}
