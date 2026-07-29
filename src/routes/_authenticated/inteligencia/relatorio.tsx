import { ProtectedRoute } from "@/components/rbac/ProtectedRoute";
import { MODULE_ROLES } from "@/lib/rbac/types";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef } from "react";
import { z } from "zod";
import { ArrowLeft, Loader2 } from "lucide-react";
import {
  generateIntelligenceReport,
  getIntelligenceReport,
} from "@/lib/intelligence-report.functions";
import { ReportView } from "@/components/intelligence/ReportView";

const searchSchema = z.object({
  id: z.string().uuid().optional(),
  pending: z.string().min(1).max(200).optional(),
});

export const Route = createFileRoute("/_authenticated/inteligencia/relatorio")({
  validateSearch: (s) => searchSchema.parse(s),
  component: () => (
    <ProtectedRoute requiredRoles={MODULE_ROLES.inteligencia}>
      <ReportPage />
    </ProtectedRoute>
  ),
});

function ReportPage() {
  const { id, pending } = Route.useSearch();
  const navigate = useNavigate();
  const getFn = useServerFn(getIntelligenceReport);
  const generateFn = useServerFn(generateIntelligenceReport);
  const triggeredRef = useRef(false);

  // Se veio com ?pending=Empresa, dispara a geração imediatamente e depois
  // troca a URL para ?id=<uuid> (histórico do navegador limpo).
  const generation = useQuery({
    queryKey: ["intelligence-report-generate", pending],
    enabled: Boolean(pending && !id),
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
    queryFn: async () => {
      if (!pending) throw new Error("Empresa não informada");
      let ctx: { oQueVende?: string; diferencial?: string; infoExtra?: string } = {};
      try {
        const raw = sessionStorage.getItem("lf-intel-ctx");
        if (raw) ctx = JSON.parse(raw) as typeof ctx;
        sessionStorage.removeItem("lf-intel-ctx");
      } catch {
        /* ignore */
      }
      const res = await generateFn({
        data: {
          companyName: pending,
          sourceLeadEmpresa: pending,
          oQueVende: ctx.oQueVende,
          diferencial: ctx.diferencial,
          infoExtra: ctx.infoExtra,
        },
      });
      return res;
    },
  });

  useEffect(() => {
    if (generation.data?.id && !id && !triggeredRef.current) {
      triggeredRef.current = true;
      navigate({
        to: "/inteligencia/relatorio",
        search: { id: generation.data.id },
        replace: true,
      });
    }
  }, [generation.data?.id, id, navigate]);

  const detail = useQuery({
    queryKey: ["intelligence-report", id],
    enabled: Boolean(id),
    queryFn: () => getFn({ data: { id: id! } }),
  });

  const isGenerating = Boolean(pending && !id);
  const isLoading = isGenerating ? generation.isLoading : detail.isLoading;
  const error = isGenerating ? generation.error : detail.error;
  const report = isGenerating ? generation.data?.report : detail.data?.report;

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
          <div className="bg-card rounded-3xl shadow-card-soft p-10 flex flex-col items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <p className="font-semibold text-foreground">
              {isGenerating ? `Gerando dossiê de ${pending}…` : "Carregando relatório…"}
            </p>
            {isGenerating && (
              <p className="text-xs">
                Consultando fontes abertas, notícias e cadastros públicos. Pode levar até 1 minuto.
              </p>
            )}
          </div>
        )}
        {error && (
          <div className="bg-card rounded-3xl shadow-card-soft p-6 text-destructive text-sm">
            {error instanceof Error ? error.message : "Erro ao carregar"}
          </div>
        )}
        {report && <ReportView report={report} />}
      </div>
    </main>
  );
}
