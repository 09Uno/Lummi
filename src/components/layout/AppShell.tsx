import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppSidebar } from "./AppSidebar";
import { countPendingTasks } from "@/lib/crm.functions";
import { useTheme } from "@/hooks/useTheme";
import { useEffect } from "react";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { ready, theme } = useTheme();
  const countFn = useServerFn(countPendingTasks);

  const { data } = useQuery({
    queryKey: ["pending-tasks-count"],
    queryFn: async () => {
      try {
        return await countFn({});
      } catch {
        return { count: 0, overdue: 0 };
      }
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  // Re-assert theme attribute after mount (covers edge cases with SSR)
  useEffect(() => {
    if (!ready) return;
    const root = document.documentElement;
    root.setAttribute("data-theme", theme);
    root.classList.toggle("dark", theme === "dark");
  }, [ready, theme]);

  return (
    <div
      className="min-h-screen flex bg-[var(--cy-content-bg)] text-[var(--cy-content-ink)] transition-colors duration-200"
      data-shell-theme={theme}
    >
      <AppSidebar pendingTasks={data?.count ?? 0} overdueTasks={data?.overdue ?? 0} />
      <div className="flex-1 min-w-0 flex flex-col pt-14 lg:pt-0">
        <main className="flex-1 overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
}
