import { createFileRoute } from "@tanstack/react-router";
import { ProtectedRoute } from "@/components/rbac/ProtectedRoute";
import { MODULE_ROLES, ROLE_LABELS } from "@/lib/rbac/types";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { Moon, Sun, User } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  component: () => (
    <ProtectedRoute requiredRoles={MODULE_ROLES.configuracoes}>
      <ConfigPage />
    </ProtectedRoute>
  ),
});

function ConfigPage() {
  const { user, role } = useAuth();
  const { theme, setTheme } = useTheme();

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-5">
      <div className="rounded-2xl border border-[var(--cy-card-border)] bg-[var(--cy-card)] px-5 py-4 shadow-sm">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--cy-muted)]">
          Sistema › Configurações
        </p>
        <h1 className="mt-1 text-2xl font-extrabold text-[var(--cy-content-ink)]">Configurações</h1>
      </div>

      {/* Profile */}
      <section className="rounded-2xl border border-[var(--cy-card-border)] bg-[var(--cy-card)] p-5 shadow-sm space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--cy-muted)] flex items-center gap-2">
          <User className="w-3.5 h-3.5" /> Perfil
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-[10px] font-bold uppercase text-[var(--cy-muted)]">Nome</p>
            <p className="font-semibold text-[var(--cy-content-ink)]">{user?.full_name ?? "—"}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase text-[var(--cy-muted)]">E-mail</p>
            <p className="font-semibold text-[var(--cy-content-ink)]">{user?.email}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase text-[var(--cy-muted)]">Papel</p>
            <p className="font-semibold text-[var(--cy-content-ink)]">
              {role ? ROLE_LABELS[role] : "—"}
            </p>
          </div>
        </div>
      </section>

      {/* Theme */}
      <section className="rounded-2xl border border-[var(--cy-card-border)] bg-[var(--cy-card)] p-5 shadow-sm space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--cy-muted)]">
          Aparência
        </h2>
        <p className="text-sm text-[var(--cy-muted)]">
          Alterna entre o modo claro (padrão Fintrusx) e o modo escuro, mantendo a identidade Code
          to You.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setTheme("light")}
            className={cn(
              "inline-flex items-center gap-2 h-10 px-4 rounded-xl text-sm font-semibold border transition",
              theme === "light"
                ? "bg-[#0F4C5C] text-white border-[#0F4C5C]"
                : "bg-transparent border-[var(--cy-card-border)] text-[var(--cy-content-ink)]",
            )}
          >
            <Sun className="w-4 h-4" /> Claro
          </button>
          <button
            type="button"
            onClick={() => setTheme("dark")}
            className={cn(
              "inline-flex items-center gap-2 h-10 px-4 rounded-xl text-sm font-semibold border transition",
              theme === "dark"
                ? "bg-[#0F4C5C] text-white border-[#0F4C5C]"
                : "bg-transparent border-[var(--cy-card-border)] text-[var(--cy-content-ink)]",
            )}
          >
            <Moon className="w-4 h-4" /> Escuro
          </button>
        </div>
      </section>
    </div>
  );
}
