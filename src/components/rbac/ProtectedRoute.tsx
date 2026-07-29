import { Navigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";
import type { UserRole } from "@/lib/rbac/types";
import type { ReactNode } from "react";

export function ProtectedRoute({
  children,
  requiredRoles,
  fallbackTo = "/",
}: {
  children: ReactNode;
  requiredRoles?: UserRole | UserRole[];
  fallbackTo?: string;
}) {
  const { isAuthenticated, isLoading, canAccess, user, role, ready } = useAuth();

  // Só bloqueia no bootstrap inicial do provider — não em soft revalidation
  if (!ready || (isLoading && !isAuthenticated)) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-[#0F4C5C]" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/auth" />;
  }

  if (!user || !role) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 px-4 text-center">
        <p className="text-sm text-[var(--cy-content-ink)]">Conta sem perfil no sistema.</p>
        <p className="text-xs text-[var(--cy-muted)]">
          Peça ao administrador para vincular seu usuário.
        </p>
      </div>
    );
  }

  if (requiredRoles && !canAccess(requiredRoles)) {
    return <Navigate to={fallbackTo} />;
  }

  return <>{children}</>;
}

export function RoleGate({
  children,
  roles,
  fallback = null,
}: {
  children: ReactNode;
  roles: UserRole | UserRole[];
  fallback?: ReactNode;
}) {
  const { role, ready, isLoading, isAuthenticated } = useAuth();
  if (!ready || (isLoading && !isAuthenticated)) return fallback;
  const list = Array.isArray(roles) ? roles : [roles];
  if (!role || (role !== "administrador" && !list.includes(role))) {
    return fallback;
  }
  return <>{children}</>;
}
