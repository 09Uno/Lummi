# Lummi

Prospecção B2B com IA — descubra empresas ideais em segundos e exporte pro HubSpot.

Combina web search em tempo real com curadoria por IA (Gemini) para entregar listas de leads B2B alinhadas ao ICP + dossiê de inteligência comercial por empresa.

## Stack

- **Front + SSR**: TanStack Start (React 19, Vite, Nitro `node-server` preset)
- **Estilo**: Tailwind v4 + shadcn/ui
- **Banco / Auth**: Supabase (Postgres + Auth com RLS)
- **IA**: Google Gemini via REST
- **CRM**: HubSpot Private App (server-only, escopo `crm.objects.companies`)
- **Deploy**: Docker (node:22-alpine) atrás de Nginx Proxy Manager

## Rodar localmente

```bash
cp .env.example .env    # preencha os valores reais
npm ci
npm run dev             # http://localhost:3000
```

Build e preview de produção:

```bash
npm run build
node .output/server/index.mjs
```

## Deploy

Ver `docker-compose.yml` e o runbook interno. Resumo:

```bash
# na VPS
mkdir -p ~/docker/sistemas/lummi && cd $_
git clone https://github.com/09Uno/Lummi.git repo
cp repo/docker-compose.yml .
cp repo/.env.example .env && nano .env
docker compose up -d --build
```

Aponta um Proxy Host no NPM: `<dominio>` → `lummi-web:3000` pela rede `proxy-net`.

## Migrations

Aplicar `supabase/migrations/*.sql` no dashboard Supabase (SQL Editor) na ordem de nome.
