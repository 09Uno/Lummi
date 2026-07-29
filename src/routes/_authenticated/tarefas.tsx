import { createFileRoute } from "@tanstack/react-router";
import { ProtectedRoute } from "@/components/rbac/ProtectedRoute";
import { MODULE_ROLES } from "@/lib/rbac/types";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listAllCrmTasks, toggleCrmTask } from "@/lib/crm.functions";
import { CRM_TASK_TYPE_META } from "@/lib/crm/types";
import { useMemo, useState } from "react";
import { CheckSquare, Loader2, Filter } from "lucide-react";
import { cn } from "@/lib/utils";
import { listTeamSdrs } from "@/lib/rbac/admin.functions";

export const Route = createFileRoute("/_authenticated/tarefas")({
  component: () => (
    <ProtectedRoute requiredRoles={MODULE_ROLES.tarefas}>
      <TarefasPage />
    </ProtectedRoute>
  ),
});

function TarefasPage() {
  const { role, user } = useAuth();
  const isManager = role === "administrador" || role === "gestor_comercial";
  const [status, setStatus] = useState<"all" | "pending" | "done">("pending");
  const [sdrFilter, setSdrFilter] = useState<string>("");
  const listFn = useServerFn(listAllCrmTasks);
  const toggleFn = useServerFn(toggleCrmTask);
  const teamFn = useServerFn(listTeamSdrs);
  const qc = useQueryClient();

  const { data: team } = useQuery({
    queryKey: ["team-for-tasks"],
    enabled: isManager,
    queryFn: async () => {
      try {
        return await teamFn({});
      } catch {
        return {
          sdrs: [] as Array<{ id: string; full_name: string | null; email: string; role: string }>,
        };
      }
    },
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["all-tasks", status, sdrFilter],
    queryFn: () =>
      listFn({
        data: {
          status,
          assigned_user_id: sdrFilter || undefined,
        },
      }),
  });

  const tasks = useMemo(() => {
    const list = data?.tasks ?? [];
    const now = Date.now();
    return [...list].sort((a, b) => {
      const aOver = a.due_at && !a.done && new Date(a.due_at).getTime() < now ? 0 : 1;
      const bOver = b.due_at && !b.done && new Date(b.due_at).getTime() < now ? 0 : 1;
      if (aOver !== bOver) return aOver - bOver;
      const ad = a.due_at ? new Date(a.due_at).getTime() : Infinity;
      const bd = b.due_at ? new Date(b.due_at).getTime() : Infinity;
      return ad - bd;
    });
  }, [data?.tasks]);

  const sdrs = useMemo(() => team?.sdrs ?? [], [team]);

  async function onToggle(id: string, done: boolean) {
    await toggleFn({ data: { id, done: !done } });
    void qc.invalidateQueries({ queryKey: ["all-tasks"] });
    void qc.invalidateQueries({ queryKey: ["pending-tasks-count"] });
    void qc.invalidateQueries({ queryKey: ["pending-tasks-count-home"] });
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-5">
      <div className="rounded-2xl border border-[var(--cy-card-border)] bg-[var(--cy-card)] px-5 py-4 shadow-sm">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--cy-muted)]">
          Rotina › Tarefas
        </p>
        <h1 className="mt-1 text-2xl font-extrabold text-[var(--cy-content-ink)]">Tarefas</h1>
        <p className="text-sm text-[var(--cy-muted)] mt-1">
          {isManager
            ? "Acompanhe follow-ups da equipe e filtre por SDR."
            : "Suas tarefas de follow-up, ligações e reuniões."}
        </p>
      </div>

      {(() => {
        const overdueN = tasks.filter(
          (x) => !x.done && x.due_at && new Date(x.due_at).getTime() < Date.now(),
        ).length;
        if (overdueN <= 0) return null;
        return (
          <div
            role="status"
            className="rounded-xl border border-[var(--lf-danger)]/40 bg-[color-mix(in_srgb,var(--lf-danger)_8%,var(--cy-card))] px-4 py-2 text-sm text-[var(--lf-danger)] font-semibold"
          >
            {overdueN} tarefa{overdueN > 1 ? "s" : ""} vencida{overdueN > 1 ? "s" : ""} — priorize o
            follow-up.
          </div>
        );
      })()}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="w-4 h-4 text-[var(--cy-muted)]" />
        {(["pending", "done", "all"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(s)}
            className={cn(
              "h-8 px-3 rounded-full text-xs font-semibold border transition",
              status === s
                ? "bg-[#0F4C5C] text-white border-[#0F4C5C]"
                : "bg-[var(--cy-card)] text-[var(--cy-muted)] border-[var(--cy-card-border)] hover:border-[#2E7A85]",
            )}
          >
            {s === "pending" ? "Pendentes" : s === "done" ? "Concluídas" : "Todas"}
          </button>
        ))}
        {isManager && (
          <select
            value={sdrFilter}
            onChange={(e) => setSdrFilter(e.target.value)}
            className="h-8 ml-auto rounded-full border border-[var(--cy-card-border)] bg-[var(--cy-card)] px-3 text-xs font-medium text-[var(--cy-content-ink)]"
          >
            <option value="">Todos os SDRs</option>
            {sdrs.map((u) => (
              <option key={u.id} value={u.id}>
                {u.full_name || u.email}
              </option>
            ))}
          </select>
        )}
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-16 text-[var(--cy-muted)] gap-2 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando tarefas…
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-red-300 bg-red-50 text-red-700 text-sm p-4">
          {error instanceof Error ? error.message : "Erro ao carregar"}
        </div>
      )}

      {!isLoading && tasks.length === 0 && (
        <div className="rounded-2xl border border-dashed border-[var(--cy-card-border)] bg-[var(--cy-card)] p-10 text-center text-sm text-[var(--cy-muted)]">
          <CheckSquare className="w-8 h-8 mx-auto mb-2 opacity-40" />
          Nenhuma tarefa neste filtro.
        </div>
      )}

      <ul className="space-y-2">
        {tasks.map((t) => {
          const isOverdue = !t.done && !!t.due_at && new Date(t.due_at).getTime() < Date.now();
          return (
            <li
              key={t.id}
              className={cn(
                "rounded-xl border px-4 py-3 flex items-start gap-3 shadow-sm",
                isOverdue
                  ? "border-[var(--lf-danger)]/50 bg-[color-mix(in_srgb,var(--lf-danger)_6%,var(--cy-card))]"
                  : "border-[var(--cy-card-border)] bg-[var(--cy-card)]",
                t.done && "opacity-60",
              )}
            >
              <button
                type="button"
                onClick={() => onToggle(t.id, t.done)}
                className={cn(
                  "mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition",
                  t.done
                    ? "bg-[#2E7A85] border-[#2E7A85] text-white"
                    : "border-[#7FB0B4] hover:border-[#0F4C5C]",
                )}
                aria-label={t.done ? "Reabrir" : "Concluir"}
              >
                {t.done && <CheckSquare className="w-3.5 h-3.5" />}
              </button>
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    "text-sm font-semibold text-[var(--cy-content-ink)]",
                    t.done && "line-through",
                  )}
                >
                  {t.title}
                </p>
                <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-[11px] text-[var(--cy-muted)]">
                  <span className="font-medium text-[#2E7A85]">
                    {CRM_TASK_TYPE_META[t.task_type]?.label ?? t.task_type}
                  </span>
                  {"organization" in t && t.organization && (
                    <span>Lead: {String(t.organization)}</span>
                  )}
                  {t.due_at && (
                    <span
                      className={cn(
                        !t.done &&
                          new Date(t.due_at).getTime() < Date.now() &&
                          "font-semibold text-[var(--lf-danger)]",
                      )}
                    >
                      {!t.done && new Date(t.due_at).getTime() < Date.now()
                        ? "Vencida: "
                        : "Vence: "}
                      {new Date(t.due_at).toLocaleString("pt-BR", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  )}
                  {isManager && t.user_id !== user?.id && (
                    <span className="opacity-70">SDR: {t.user_id.slice(0, 8)}…</span>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
