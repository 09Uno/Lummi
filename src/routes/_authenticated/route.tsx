import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const navigate = useNavigate();
  const [isReady, setIsReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      const hasSession = Boolean(data.session);
      setIsAuthenticated(hasSession);
      setIsReady(true);
      if (!hasSession) navigate({ to: "/auth", replace: true });
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      const hasSession = Boolean(session);
      setIsAuthenticated(hasSession);
      setIsReady(true);
      if (event === "SIGNED_OUT" || !hasSession) navigate({ to: "/auth", replace: true });
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [navigate]);

  if (!isReady || !isAuthenticated) {
    return (
      <main className="min-h-screen bg-hero-gradient flex items-center justify-center px-4">
        <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm font-semibold text-white backdrop-blur">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando sessão…
        </div>
      </main>
    );
  }

  return <Outlet />;
}
