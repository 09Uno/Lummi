import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

/** Singleton QueryClient — preserves cache across navigations (SPA feel). */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 30 * 60 * 1000, // 30 minutes
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export const getRouter = () => {
  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 30_000,
    // Precarrega a rota (dados + código) ao passar o mouse/focar o link,
    // não só ao clicar — é o que faz a navegação parecer instantânea
    // (padrão Notion/Linear/HubSpot/Pipedrive).
    defaultPreload: "intent",
    // Evita "flash" de loading em navegações rápidas; só mostra estado de
    // carregamento se realmente demorar.
    defaultPendingMs: 150,
    defaultPendingMinMs: 300,
  });

  return router;
};
