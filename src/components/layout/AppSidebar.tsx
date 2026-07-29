import { Link, useRouterState } from "@tanstack/react-router";
import {
  Home,
  Users,
  Brain,
  Kanban,
  CheckSquare,
  BarChart3,
  Settings,
  Shield,
  LogOut,
  Menu,
  X,
  Moon,
  Sun,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { ROLE_LABELS, type UserRole } from "@/lib/rbac/types";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "@tanstack/react-router";

type NavItem = {
  to: string;
  label: string;
  icon: React.ReactNode;
  roles?: UserRole[];
  badgeKey?: "tasks";
};

const NAV: NavItem[] = [
  { to: "/", label: "Início", icon: <Home className="w-4 h-4" /> },
  {
    to: "/prospeccao",
    label: "Prospecção",
    icon: <Users className="w-4 h-4" />,
    roles: ["administrador", "gestor_comercial"],
  },
  {
    to: "/inteligencia",
    label: "Intel. Comercial",
    icon: <Brain className="w-4 h-4" />,
  },
  {
    to: "/crm",
    label: "CRM",
    icon: <Kanban className="w-4 h-4" />,
  },
  {
    to: "/tarefas",
    label: "Tarefas",
    icon: <CheckSquare className="w-4 h-4" />,
    badgeKey: "tasks",
  },
  {
    to: "/relatorios",
    label: "Relatórios",
    icon: <BarChart3 className="w-4 h-4" />,
    roles: ["administrador", "gestor_comercial"],
  },
  {
    to: "/admin",
    label: "Equipe",
    icon: <Shield className="w-4 h-4" />,
    roles: ["administrador", "gestor_comercial"],
  },
  {
    to: "/configuracoes",
    label: "Configurações",
    icon: <Settings className="w-4 h-4" />,
  },
];

export function AppSidebar({
  pendingTasks = 0,
  overdueTasks = 0,
}: {
  pendingTasks?: number;
  overdueTasks?: number;
}) {
  const { user, role } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const items = useMemo(() => {
    return NAV.filter((item) => {
      if (!item.roles) return true;
      if (!role) return false;
      if (role === "administrador") return true;
      return item.roles.includes(role);
    });
  }, [role]);

  async function onLogout() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  function isActive(to: string) {
    if (to === "/") return pathname === "/" || pathname === "";
    return pathname === to || pathname.startsWith(to + "/");
  }

  const sidebarBody = (
    <aside
      data-sidebar-fixed="true"
      className="flex flex-col h-full w-[260px] min-w-[260px] bg-[#072A31] text-[#F4EFE3] border-r border-[#0F4C5C]/40"
    >
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-4 h-16 border-b border-white/8 shrink-0">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#0F4C5C] to-[#2E7A85] flex items-center justify-center font-bold text-sm shrink-0">
          CY
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold leading-tight truncate">LeadForge</p>
          <p className="text-[10px] text-[#7FB0B4] truncate">Code to You</p>
        </div>
      </div>

      {/* Search hint */}
      <div className="px-3 pt-3 shrink-0">
        <div className="flex items-center gap-2 h-9 px-3 rounded-lg bg-white/5 border border-white/8 text-xs text-[#7FB0B4]">
          <span className="truncate">Buscar módulo</span>
          <kbd className="ml-auto text-[10px] opacity-60 border border-white/15 rounded px-1">
            ⌘K
          </kbd>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        {items.map((item) => {
          const active = isActive(item.to);
          const badge = item.badgeKey === "tasks" && pendingTasks > 0 ? pendingTasks : null;
          const isOverdue = item.badgeKey === "tasks" && overdueTasks > 0;
          return (
            <Link
              key={item.to}
              to={item.to}
              title={item.label}
              className={cn(
                "group relative flex items-center gap-3 h-10 rounded-lg px-3 text-sm font-medium transition-colors",
                active
                  ? "bg-[#0F4C5C] text-white"
                  : "text-[#c8d8da] hover:bg-white/6 hover:text-white",
              )}
            >
              {active && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r bg-[#E4A063]" />
              )}
              <span
                className={cn(
                  "shrink-0",
                  active ? "text-[#E4A063]" : "text-[#7FB0B4] group-hover:text-[#E4A063]",
                )}
              >
                {item.icon}
              </span>
              <span className="truncate flex-1">
                {item.label}
                {isOverdue && !badge ? " 🔴" : ""}
              </span>
              {badge != null && (
                <span
                  className={cn(
                    "ml-auto min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold flex items-center justify-center",
                    isOverdue ? "bg-[#e01e2c] text-white" : "bg-[#E4A063] text-[#072A31]",
                  )}
                >
                  {badge > 99 ? "99+" : badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* User + theme + logout */}
      <div className="border-t border-white/8 p-3 space-y-2 shrink-0">
        {user && (
          <div className="flex items-center gap-2.5 px-1">
            <div className="w-8 h-8 rounded-full bg-[#2E7A85] flex items-center justify-center text-xs font-bold shrink-0">
              {(user.full_name ?? user.email ?? "?").slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold truncate">{user.full_name ?? user.email}</p>
              <p className="text-[10px] text-[#7FB0B4] truncate">
                {role ? ROLE_LABELS[role] : "—"}
              </p>
            </div>
          </div>
        )}
        <div className="flex gap-1">
          <button
            type="button"
            onClick={toggleTheme}
            className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-[#7FB0B4] hover:bg-white/8 hover:text-white transition"
            title={theme === "dark" ? "Modo claro" : "Modo escuro"}
            aria-label="Alternar tema"
          >
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="inline-flex items-center gap-2 h-8 rounded-lg text-[#7FB0B4] hover:bg-white/8 hover:text-white transition text-xs font-medium flex-1 px-2"
            title="Sair"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sair
          </button>
        </div>
        <p className="text-[9px] text-[#56696D] text-center pt-1 tracking-wide">
          DESENVOLVIDO POR Code to You
        </p>
      </div>
    </aside>
  );

  return (
    <>
      {/* Mobile top bar */}
      <div
        data-sidebar-fixed="true"
        className="lg:hidden fixed top-0 inset-x-0 z-40 h-14 bg-[#072A31] text-white flex items-center px-3 gap-3 border-b border-[#0F4C5C]/40"
      >
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="h-9 w-9 inline-flex items-center justify-center rounded-lg hover:bg-white/10"
          aria-label="Abrir menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        <span className="font-bold text-sm">LeadForge</span>
        <button
          type="button"
          onClick={toggleTheme}
          className="ml-auto h-9 w-9 inline-flex items-center justify-center rounded-lg hover:bg-white/10"
          aria-label="Alternar tema"
        >
          {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
        {pendingTasks > 0 && (
          <span
            className={
              "min-w-[22px] h-5 px-1.5 rounded-full text-[11px] font-bold flex items-center justify-center " +
              (overdueTasks > 0 ? "bg-[#e01e2c] text-white" : "bg-[#E4A063] text-[#072A31]")
            }
          >
            {pendingTasks}
          </span>
        )}
      </div>

      {/* Desktop sidebar */}
      <div className="hidden lg:flex sticky top-0 h-screen shrink-0 z-30 w-[260px] min-w-[260px]">
        {sidebarBody}
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <div className="relative h-full w-[260px] shadow-2xl">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute top-3 right-3 z-10 h-8 w-8 inline-flex items-center justify-center rounded-lg bg-white/10 text-white"
            >
              <X className="w-4 h-4" />
            </button>
            {sidebarBody}
          </div>
        </div>
      )}
    </>
  );
}
