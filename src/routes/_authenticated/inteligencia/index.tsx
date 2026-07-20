import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Loader2, Search, History, Sparkles, Star } from "lucide-react";
import { useIntelligenceHistory } from "@/hooks/useIntelligenceHistory";

export const Route = createFileRoute("/_authenticated/inteligencia/")({
  component: IntelligenceHome,
});

function IntelligenceHome() {
  const navigate = useNavigate();
  const [companyName, setCompanyName] = useState("");
  const { items, isLoading, generate } = useIntelligenceHistory();

  async function onGenerate() {
    const name = companyName.trim();
    if (!name || generate.isPending) return;
    try {
      const res = await generate.mutateAsync({ companyName: name });
      navigate({
        to: "/inteligencia/relatorio",
        search: { id: res.id },
      });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erro ao gerar relatório");
    }
  }

  const recent = items.slice(0, 8);

  return (
    <main className="min-h-screen bg-hero-gradient">
      <div className="max-w-3xl mx-auto px-4 pt-10 pb-20 sm:pt-16">
        <div className="flex items-center gap-3 mb-6">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-white/85 text-xs font-semibold hover:text-white"
          >
            <ArrowLeft className="w-4 h-4" /> Home
          </Link>
          <Link
            to="/inteligencia/historico"
            className="ml-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-full bg-white/15 hover:bg-white/25 backdrop-blur text-white text-xs font-semibold"
          >
            <History className="w-3.5 h-3.5" /> Histórico
          </Link>
        </div>

        <header className="text-white mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5" /> INTELIGÊNCIA COMERCIAL
          </div>
          <h1 className="mt-4 text-4xl sm:text-5xl font-extrabold leading-tight">
            Dossiê completo de qualquer empresa.
          </h1>
          <p className="mt-3 text-white/85 text-base sm:text-lg max-w-xl">
            Perfil, cultura de benefícios, maturidade educacional, oportunidades e perguntas para
            discovery.
          </p>
        </header>

        <section className="bg-card rounded-3xl shadow-card-soft p-6 sm:p-8 space-y-4">
          <label className="block text-sm font-bold text-foreground">Nome da empresa</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onGenerate()}
              placeholder="Ex: Construtora ABC, Grupo XYZ…"
              className="flex-1 h-12 rounded-2xl border border-border bg-white px-4 text-sm outline-none focus:border-foreground transition"
            />
            <button
              type="button"
              onClick={onGenerate}
              disabled={!companyName.trim() || generate.isPending}
              className="inline-flex items-center gap-2 px-5 h-12 rounded-2xl text-sm font-bold text-white bg-gradient-to-r from-[oklch(0.65_0.24_15)] via-[oklch(0.55_0.26_340)] to-[oklch(0.5_0.24_290)] disabled:opacity-50"
            >
              {generate.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
              Gerar dossiê
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Relatórios recentes (últimas 6h) desta empresa são reaproveitados automaticamente.
          </p>
        </section>

        {recent.length > 0 && (
          <section className="mt-6 bg-card rounded-3xl shadow-card-soft p-6 sm:p-8">
            <h2 className="text-lg font-extrabold mb-4">Pesquisas recentes</h2>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Carregando…</p>
            ) : (
              <ul className="divide-y divide-border">
                {recent.map((r) => (
                  <li key={r.id} className="py-3 flex items-center gap-3">
                    <Link
                      to="/inteligencia/relatorio"
                      search={{ id: r.id }}
                      className="flex-1 font-bold text-foreground hover:text-primary"
                    >
                      {r.company_name}
                    </Link>
                    {r.is_favorite && <Star className="w-4 h-4 text-amber-500 fill-amber-500" />}
                    <span className="text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleDateString("pt-BR")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
