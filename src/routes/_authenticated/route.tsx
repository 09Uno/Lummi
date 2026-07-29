import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppShell } from "@/components/layout/AppShell";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading, user, role, accessDenied, ready } = useAuth();

  // Redirect só quando a sessão já foi resolvida — nunca no meio de soft-load
  useEffect(() => {
    if (!ready) return;
    if (accessDenied || (!isLoading && !isAuthenticated)) {
      navigate({ to: "/auth", replace: true });
    }
  }, [ready, accessDenied, isLoading, isAuthenticated, navigate]);

  // Spinner APENAS no primeiro boot desta aba
  if (!ready || (isLoading && !isAuthenticated)) {
    return (
      <main className="min-h-screen bg-[var(--cy-content-bg)] flex items-center justify-center px-4">
        <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-[var(--cy-content-ink)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando sessão…
        </div>
      </main>
    );
  }

  if (accessDenied || !isAuthenticated || !user || !role) {
    return (
      <main className="min-h-screen bg-[var(--cy-content-bg)] flex items-center justify-center px-4">
        <div className="max-w-sm text-center space-y-3">
          <p className="text-sm text-[var(--cy-content-ink)] font-semibold">
            Acesso não autorizado
          </p>
          <p className="text-xs text-[var(--cy-muted)]">
            Sua conta não tem perfil no sistema. Peça ao administrador para criar seu login.
          </p>
          <button
            type="button"
            onClick={() => {
              void supabase.auth.signOut().then(() => navigate({ to: "/auth", replace: true }));
            }}
            className="inline-flex items-center justify-center rounded-xl bg-white/10 px-4 py-2 text-xs font-semibold text-white hover:bg-white/20"
          >
            Voltar ao login
          </button>
        </div>
      </main>
    );
  }

  // Depois do boot: AppShell + Outlet ficam montados entre navegações
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
