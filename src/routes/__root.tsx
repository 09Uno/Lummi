import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

// Side-effect import ensures Vite always processes the stylesheet
import "../styles.css";
import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-hero-gradient px-4">
      <div className="max-w-md text-center bg-card rounded-3xl shadow-card-soft p-8">
        <h1 className="text-6xl font-extrabold text-foreground">404</h1>
        <h2 className="mt-3 text-lg font-bold text-foreground">Página não encontrada</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          O link pode estar quebrado ou a página foi movida. Volte para o início e tente de novo.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-full bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:opacity-90 transition"
          >
            Voltar ao início
          </Link>
          <a
            href="mailto:suporte@lummi.app"
            className="inline-flex items-center justify-center rounded-full border border-border px-4 py-2 text-sm font-semibold text-foreground hover:bg-secondary transition"
          >
            Falar com suporte
          </a>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Lummi — Prospecção B2B com IA" },
      {
        name: "description",
        content:
          "Gere listas de leads B2B qualificadas combinando web search e curadoria por IA com exportação para o Hubspot",
      },
      { name: "author", content: "Lummi" },
      { name: "google", content: "notranslate" },
      { name: "googlebot", content: "notranslate" },
      { property: "og:title", content: "Lummi — Prospecção B2B com IA" },
      {
        property: "og:description",
        content:
          "Gere listas de leads B2B qualificadas combinando web search e curadoria por IA com exportação para o Hubspot",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Lummi — Prospecção B2B com IA" },
      {
        name: "twitter:description",
        content:
          "Gere listas de leads B2B qualificadas combinando web search e curadoria por IA com exportação para o Hubspot",
      },
      {
        property: "og:image",
        content:
          "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/52a5f6d0-2a1f-4014-bce4-10e6080edf35",
      },
      {
        name: "twitter:image",
        content:
          "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/52a5f6d0-2a1f-4014-bce4-10e6080edf35",
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&display=swap",
      },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" translate="no">
      <head>
        <HeadContent />
      </head>
      <body className="notranslate" translate="no">
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
    </QueryClientProvider>
  );
}
