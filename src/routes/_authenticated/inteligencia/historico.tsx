import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Star } from "lucide-react";
import { useIntelligenceHistory } from "@/hooks/useIntelligenceHistory";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/inteligencia/historico")({
  component: HistoryPage,
});

function HistoryPage() {
  const { items, isLoading, toggleFavorite } = useIntelligenceHistory();

  return (
    <main className="min-h-screen bg-hero-gradient">
      <div className="max-w-3xl mx-auto px-4 pt-10 pb-20 sm:pt-16">
        <Link
          to="/inteligencia"
          className="inline-flex items-center gap-1.5 text-white/85 text-xs font-semibold hover:text-white mb-6"
        >
          <ArrowLeft className="w-4 h-4" /> Voltar
        </Link>

        <header className="text-white mb-8">
          <h1 className="text-3xl sm:text-4xl font-extrabold">Histórico de relatórios</h1>
          <p className="mt-2 text-white/85 text-sm">Todos os dossiês que você já gerou.</p>
        </header>

        <section className="bg-card rounded-3xl shadow-card-soft p-6 sm:p-8">
          {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
          {!isLoading && items.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum relatório gerado ainda.</p>
          )}
          {items.length > 0 && (
            <ul className="divide-y divide-border">
              {items.map((r) => (
                <li key={r.id} className="py-3 flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => toggleFavorite.mutate({ id: r.id, isFavorite: !r.is_favorite })}
                    className={cn(
                      "p-1 rounded-full transition",
                      r.is_favorite
                        ? "text-amber-500"
                        : "text-muted-foreground hover:text-amber-500",
                    )}
                  >
                    <Star className={cn("w-4 h-4", r.is_favorite && "fill-amber-500")} />
                  </button>
                  <Link
                    to="/inteligencia/relatorio"
                    search={{ id: r.id }}
                    className="flex-1 font-bold text-foreground hover:text-primary truncate"
                  >
                    {r.company_name}
                  </Link>
                  {r.source_lead_empresa && (
                    <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-secondary text-muted-foreground font-bold">
                      Via prospecção
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground shrink-0">
                    {new Date(r.created_at).toLocaleDateString("pt-BR")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
