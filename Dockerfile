# syntax=docker/dockerfile:1.7

# =============================================================================
# Build stage — instala deps e roda o build do Vite/Nitro em preset node-server.
# =============================================================================
FROM node:22-alpine AS build

WORKDIR /app

# Copia manifests primeiro pra aproveitar cache de layer.
COPY package.json package-lock.json ./

# npm ci = install determinístico a partir do package-lock.json.
RUN npm ci --no-audit --no-fund

# Copia o restante do repositório.
COPY . .

# Força preset Node no Nitro (o default do @lovable.dev/vite-tanstack-config é cloudflare).
ENV NITRO_PRESET=node-server
ENV NODE_ENV=production

# Build precisa das VITE_* pra injetar no bundle do cliente.
# Passe via docker-compose > build.args > ARG (mesmos nomes).
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_SUPABASE_PROJECT_ID
ENV VITE_SUPABASE_URL=${VITE_SUPABASE_URL}
ENV VITE_SUPABASE_PUBLISHABLE_KEY=${VITE_SUPABASE_PUBLISHABLE_KEY}
ENV VITE_SUPABASE_PROJECT_ID=${VITE_SUPABASE_PROJECT_ID}

RUN npm run build

# =============================================================================
# Runtime stage — só o output do Nitro + node. Imagem final pequena.
# =============================================================================
FROM node:22-alpine AS runtime

WORKDIR /app

# Usuário sem privilégios (a imagem node já traz o UID 1000 "node").
USER node

# Nitro node-server é auto-contido em .output/ (server + assets).
COPY --from=build --chown=node:node /app/.output ./.output

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000

# Healthcheck bate na raiz — falha se o SSR não estiver de pé.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"

CMD ["node", ".output/server/index.mjs"]
