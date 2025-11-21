# Dockerfile para Backend (use este para o serviço de API no Easypanel)
# Contexto de build deve ser a RAIZ do repositório

FROM node:20-alpine AS builder

WORKDIR /app

# Copiar package.json do backend
COPY packages/backend/package*.json ./

# Instalar dependências (incluindo devDependencies para build)
RUN npm ci

# Copiar código fonte do backend
COPY packages/backend/ ./

# Build TypeScript
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copiar package.json
COPY packages/backend/package*.json ./

# Instalar apenas dependências de produção
RUN npm ci --only=production

# Copiar arquivos compilados do builder
COPY --from=builder /app/dist ./dist

# Expor porta
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:3001/health || exit 1

# Iniciar servidor
CMD ["npm", "start"]

