# LeadForge

Prospecção B2B com IA — descubra empresas ideais em segundos e trabalhe o pipeline num CRM Kanban nativo.

Combina web search em tempo real com curadoria por IA (Perplexity Agent API) para entregar listas de leads B2B alinhadas ao ICP, dossiê de inteligência comercial por empresa e busca de tomadores de decisão.

> Nota: os identificadores de deploy (`lummi-web`, `~/docker/sistemas/lummi`, repositório `Lummi.git`) foram mantidos do nome anterior do produto para não quebrar o container e o Proxy Host que já rodam na VPS. Renomear exige parar o container atual e reapontar o NPM.

## Stack

- **Front + SSR**: TanStack Start (React 19, Vite, Nitro `node-server` preset)
- **Estilo**: Tailwind v4 + shadcn/ui
- **Banco / Auth**: Supabase (Postgres + Auth com RLS)
- **IA**: Perplexity Agent API (`web_search`, `people_search`, `fetch_url`), com modelo por finalidade — leads, dossiê e decisores
- **CRM**: Kanban nativo em Postgres (tabelas `crm_*`), com papéis administrador / gestor comercial / SDR
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

Verificações antes de subir:

```bash
npx tsc --noEmit        # precisa terminar com 0 erros
npm run lint
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

A migration `20260729130000_rbac_and_crm_schema.sql` reconstrói `public.users` e as tabelas
`crm_*` a partir do código — elas tinham sido criadas direto no dashboard e nunca entraram no
repositório. É idempotente, mas recria as policies de RLS: revise antes de aplicar num ambiente
que já esteja no ar.
