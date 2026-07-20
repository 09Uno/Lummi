import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listIntelligenceReports,
  toggleIntelligenceFavorite,
  generateIntelligenceReport,
} from "@/lib/intelligence-report.functions";

export function useIntelligenceHistory() {
  const listFn = useServerFn(listIntelligenceReports);
  const toggleFn = useServerFn(toggleIntelligenceFavorite);
  const generateFn = useServerFn(generateIntelligenceReport);
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["intelligence-history"],
    queryFn: () => listFn(),
  });

  const toggleFavorite = useMutation({
    mutationFn: async ({ id, isFavorite }: { id: string; isFavorite: boolean }) =>
      toggleFn({ data: { id, isFavorite } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["intelligence-history"] }),
  });

  const generate = useMutation({
    mutationFn: async (input: { companyName: string; sourceLeadEmpresa?: string }) =>
      generateFn({ data: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["intelligence-history"] }),
  });

  return {
    items: query.data?.items ?? [],
    isLoading: query.isLoading,
    toggleFavorite,
    generate,
  };
}
