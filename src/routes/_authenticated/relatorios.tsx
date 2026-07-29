import { createFileRoute } from "@tanstack/react-router";
import { ProtectedRoute } from "@/components/rbac/ProtectedRoute";
import { MODULE_ROLES } from "@/lib/rbac/types";
import { BarChart3 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/relatorios")({
  component: () => (
    <ProtectedRoute requiredRoles={MODULE_ROLES.relatorios}>
      <RelatoriosPage />
    </ProtectedRoute>
  ),
});

function RelatoriosPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-5">
      <div className="rounded-2xl border border-[var(--cy-card-border)] bg-[var(--cy-card)] px-5 py-4 shadow-sm">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--cy-muted)]">
          Gestão › Relatórios
        </p>
        <h1 className="mt-1 text-2xl font-extrabold text-[var(--cy-content-ink)]">Relatórios</h1>
        <p className="text-sm text-[var(--cy-muted)] mt-1">
          Visão consolidada de pipeline, conversão e produtividade da equipe.
        </p>
      </div>
      <div className="rounded-2xl border border-dashed border-[var(--cy-card-border)] bg-[var(--cy-card)] p-12 text-center">
        <BarChart3 className="w-10 h-10 mx-auto text-[#7FB0B4] mb-3" />
        <p className="text-sm font-semibold text-[var(--cy-content-ink)]">Em construção</p>
        <p className="text-xs text-[var(--cy-muted)] mt-1 max-w-md mx-auto">
          Em breve: funil de conversão, tarefas por SDR, volume de prospecção e dossiês gerados no
          período.
        </p>
      </div>
    </div>
  );
}
