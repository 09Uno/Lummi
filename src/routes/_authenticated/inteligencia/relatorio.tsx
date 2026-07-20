import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { ArrowLeft, Loader2 } from "lucide-react";
import { getIntelligenceReport } from "@/lib/intelligence-report.functions";
import { ReportView } from "@/components/intelligence/ReportView";

const searchSchema = z.object({ id: z.string().uuid() });

export const Route = createFileRoute("/_authenticated/inteligencia/relatorio")({
  validateSearch: (s) => searchSchema.parse(s),
  component: ReportPage,
});

function ReportPage() {
  const { id } = Route.useSearch();
  const getFn = useServerFn(getIntelligenceReport);
  const { data, isLoading, error } = useQuery({
    queryKey: ["intelligence-report", id],
    queryFn: () => getFn({ data: { id } }),
  });

  return (
    <main className="min-h-screen bg-hero-gradient">
      <div className="max-w-5xl mx-auto px-4 pt-10 pb-20 sm:pt-16">
        <Link
          to="/inteligencia"
          className="inline-flex items-center gap-1.5 text-white/85 text-xs font-semibold hover:text-white mb-6"
        >
          <ArrowLeft className="w-4 h-4" /> Nova busca
        </Link>

        {isLoading && (
          <div className="bg-card rounded-3xl shadow-card-soft p-10 flex items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" /> Carregando relatório…
          </div>
        )}
        {error && (
          <div className="bg-card rounded-3xl shadow-card-soft p-6 text-destructive text-sm">
            {error instanceof Error ? error.message : "Erro ao carregar"}
          </div>
        )}
        {data && <ReportView report={data.report} />}
      </div>
    </main>
  );
}
