import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Sparkles, Users, Brain, LogOut, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/")({
  component: Home,
});

function Home() {
  const navigate = useNavigate();
  async function onLogout() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }
  return (
    <main className="min-h-screen bg-hero-gradient">
      <div className="max-w-4xl mx-auto px-4 pt-10 pb-20 sm:pt-16">
        <header className="text-white mb-10 flex items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur text-xs font-semibold tracking-wide">
              <Sparkles className="w-3.5 h-3.5" /> LUMMI
            </div>
            <h1 className="mt-4 text-4xl sm:text-5xl font-extrabold leading-tight">
              O que vamos fazer agora?
            </h1>
            <p className="mt-3 text-white/85 text-base sm:text-lg max-w-xl">
              Escolha entre encontrar novos clientes ou aprofundar a inteligência de uma empresa
              específica.
            </p>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur text-white text-xs font-semibold transition"
          >
            <LogOut className="w-3.5 h-3.5" /> Sair
          </button>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <HomeCard
            to="/prospeccao"
            title="Prospecção"
            desc="Gere listas de leads B2B qualificados por setor, porte e região, com curadoria de IA."
            icon={<Users className="w-6 h-6" />}
          />
          <HomeCard
            to="/inteligencia"
            title="Inteligência Comercial"
            desc="Dossiê aprofundado sobre uma empresa: perfil, cultura de benefícios, oportunidades e discovery."
            icon={<Brain className="w-6 h-6" />}
          />
        </div>
      </div>
    </main>
  );
}

function HomeCard({
  to,
  title,
  desc,
  icon,
}: {
  to: string;
  title: string;
  desc: string;
  icon: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      className="group bg-card rounded-3xl shadow-card-soft p-7 flex flex-col gap-4 hover:-translate-y-1 transition-transform"
    >
      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[oklch(0.65_0.24_15)] via-[oklch(0.55_0.26_340)] to-[oklch(0.5_0.24_290)] text-white flex items-center justify-center">
        {icon}
      </div>
      <div>
        <h2 className="text-xl font-extrabold text-foreground">{title}</h2>
        <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">{desc}</p>
      </div>
      <div className="mt-auto inline-flex items-center gap-1.5 text-sm font-bold text-primary group-hover:gap-2.5 transition-all">
        Abrir <ArrowRight className="w-4 h-4" />
      </div>
    </Link>
  );
}
