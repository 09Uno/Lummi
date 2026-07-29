import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Users,
  Brain,
  Kanban,
  CheckSquare,
  Shield,
  ArrowRight,
  Upload,
  Target,
  TrendingUp,
  ClipboardList,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/useAuth";
import { ROLE_LABELS } from "@/lib/rbac/types";
import { RoleGate } from "@/components/rbac/ProtectedRoute";
import { countPendingTasks } from "@/lib/crm.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/")({
  component: Home,
});

function Home() {
  const { user, role, isLoading } = useAuth();
  const countFn = useServerFn(countPendingTasks);
  const { data: taskData } = useQuery({
    queryKey: ["pending-tasks-count-home"],
    queryFn: async () => {
      try {
        return await countFn({});
      } catch {
        return { count: 0 };
      }
    },
  });

  const isManager = role === "administrador" || role === "gestor_comercial";
  const pending = taskData?.count ?? 0;
  const initials = (user?.full_name ?? user?.email ?? "?").slice(0, 1).toUpperCase();

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-8">
      {/* Header page */}
      <div className="rounded-2xl border border-[var(--cy-card-border)] bg-[var(--cy-card)] px-5 py-4 sm:px-6 sm:py-5 shadow-sm">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--cy-muted)]">
          Início › Painel
        </p>
        <h1 className="mt-1 text-2xl sm:text-3xl font-extrabold text-[var(--cy-content-ink)]">
          Olá{user?.full_name ? `, ${user.full_name.split(" ")[0]}` : ""}
        </h1>
        <p className="mt-1 text-sm text-[var(--cy-muted)]">
          Panorama do seu dia · {role ? ROLE_LABELS[role] : "—"}
        </p>
      </div>

      {/* Profile + stats */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <section className="lg:col-span-1 rounded-2xl border border-[var(--cy-card-border)] bg-[var(--cy-card)] p-5 shadow-sm">
          <div className="flex items-center gap-4">
            <div
              className={cn(
                "w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-bold text-white shrink-0",
                isManager
                  ? "bg-gradient-to-br from-[#0F4C5C] to-[#2E7A85]"
                  : "bg-gradient-to-br from-[#2E7A85] to-[#7FB0B4]",
              )}
            >
              {initials}
            </div>
            <div className="min-w-0">
              <p className="font-bold text-[var(--cy-content-ink)] truncate">
                {!isLoading ? (user?.full_name ?? user?.email) : "…"}
              </p>
              <p className="text-xs text-[var(--cy-muted)] truncate">{user?.email}</p>
              <span
                className={cn(
                  "inline-flex mt-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide",
                  isManager ? "bg-[#0F4C5C]/15 text-[#0F4C5C]" : "bg-[#2E7A85]/15 text-[#2E7A85]",
                )}
              >
                {role ? ROLE_LABELS[role] : "—"}
              </span>
            </div>
          </div>
          <p className="mt-4 text-xs text-[var(--cy-muted)] leading-relaxed">
            {isManager
              ? "Visão de gestão: equipe, pipeline e performance comercial."
              : "Visão de SDR: suas tarefas, leads atribuídos e follow-ups do dia."}
          </p>
        </section>

        <section className="lg:col-span-2 grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatCard
            label="Tarefas pendentes"
            value={String(pending)}
            hint="Aguardando ação"
            icon={<ClipboardList className="w-4 h-4" />}
            accent={pending > 0 ? "amber" : "teal"}
          />
          <StatCard
            label="Concluídas (mês)"
            value="—"
            hint="Em breve"
            icon={<CheckSquare className="w-4 h-4" />}
          />
          <StatCard
            label={isManager ? "Taxa conversão" : "Meu pipeline"}
            value="—"
            hint={isManager ? "Leads → qualificado" : "Leads atribuídos"}
            icon={<TrendingUp className="w-4 h-4" />}
          />
        </section>
      </div>

      {/* Quick actions */}
      <section>
        <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--cy-muted)] mb-3">
          Acesso rápido
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <RoleGate roles={["administrador", "gestor_comercial"]}>
            <HomeCard
              to="/prospeccao"
              title="Prospecção"
              desc="Gere listas de leads B2B por setor, porte e região."
              icon={<Users className="w-5 h-5" />}
            />
          </RoleGate>
          <HomeCard
            to="/inteligencia"
            title="Intel. Comercial"
            desc="Dossiê aprofundado com fontes e pontos de atenção."
            icon={<Brain className="w-5 h-5" />}
          />
          <HomeCard
            to="/crm"
            title="CRM"
            desc="Pipeline Kanban dos seus leads."
            icon={<Kanban className="w-5 h-5" />}
          />
          <HomeCard
            to="/tarefas"
            title="Tarefas"
            desc={
              pending > 0
                ? `${pending} pendente${pending > 1 ? "s" : ""} para hoje`
                : "Follow-ups e compromissos"
            }
            icon={<CheckSquare className="w-5 h-5" />}
            badge={pending > 0 ? pending : undefined}
          />
          <RoleGate roles={["administrador", "gestor_comercial"]}>
            <HomeCard
              to="/prospeccao"
              title="Importar leads"
              desc="Suba planilha CSV/XLSX e gere tarefas automaticamente."
              icon={<Upload className="w-5 h-5" />}
            />
          </RoleGate>
          <RoleGate roles={["administrador", "gestor_comercial"]}>
            <HomeCard
              to="/admin"
              title="Equipe"
              desc="Cadastre SDRs e gerencie papéis."
              icon={<Shield className="w-5 h-5" />}
            />
          </RoleGate>
        </div>
      </section>

      {/* Role tip */}
      <section className="rounded-2xl border border-dashed border-[var(--cy-card-border)] bg-[var(--cy-card)]/60 p-4 text-sm text-[var(--cy-muted)]">
        <div className="flex items-start gap-2">
          <Target className="w-4 h-4 mt-0.5 text-[#2E7A85] shrink-0" />
          <p>
            {isManager
              ? "Como gestor, você vê tarefas de todos os SDRs subordinados e pode filtrar por pessoa, status e data."
              : "Como SDR, você vê apenas as suas tarefas. Marque como concluídas conforme avançar nos leads."}
          </p>
        </div>
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  icon,
  accent = "teal",
}: {
  label: string;
  value: string;
  hint: string;
  icon: React.ReactNode;
  accent?: "teal" | "amber";
}) {
  return (
    <div className="rounded-2xl border border-[var(--cy-card-border)] bg-[var(--cy-card)] p-4 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--cy-muted)]">
          {label}
        </span>
        <span
          className={cn(
            "w-7 h-7 rounded-lg flex items-center justify-center",
            accent === "amber"
              ? "bg-[#E4A063]/20 text-[#E4A063]"
              : "bg-[#2E7A85]/15 text-[#2E7A85]",
          )}
        >
          {icon}
        </span>
      </div>
      <p className="text-2xl font-extrabold text-[var(--cy-content-ink)]">{value}</p>
      <p className="text-[11px] text-[var(--cy-muted)] mt-0.5">{hint}</p>
    </div>
  );
}

function HomeCard({
  to,
  title,
  desc,
  icon,
  badge,
}: {
  to: string;
  title: string;
  desc: string;
  icon: React.ReactNode;
  badge?: number;
}) {
  return (
    <Link
      to={to}
      className="group rounded-2xl border border-[var(--cy-card-border)] bg-[var(--cy-card)] p-5 flex flex-col gap-3 shadow-sm hover:border-[#2E7A85]/50 hover:shadow-md transition"
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#072A31] to-[#2E7A85] text-white flex items-center justify-center">
          {icon}
        </div>
        {badge != null && (
          <span className="ml-auto min-w-[22px] h-5 px-1.5 rounded-full bg-[#E4A063] text-[#072A31] text-[11px] font-bold flex items-center justify-center">
            {badge}
          </span>
        )}
      </div>
      <div>
        <h3 className="font-bold text-[var(--cy-content-ink)]">{title}</h3>
        <p className="text-sm text-[var(--cy-muted)] mt-1 leading-relaxed">{desc}</p>
      </div>
      <div className="mt-auto inline-flex items-center gap-1.5 text-sm font-bold text-[#0F4C5C] group-hover:gap-2.5 transition-all">
        Abrir <ArrowRight className="w-4 h-4" />
      </div>
    </Link>
  );
}
