import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-md border border-[var(--cy-card-border)] bg-[var(--cy-input-bg)] px-3 py-1 text-base text-[var(--cy-content-ink)] shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-[var(--lf-ink-faint)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--lf-accent)] focus-visible:border-[var(--lf-accent)] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
