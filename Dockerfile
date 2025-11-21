# Dockerfile para Backend (use este para o serviço de API no Easypanel)
# IMPORTANTE: Build Context deve ser a RAIZ do repositório (.)

FROM node:20-alpine AS builder

WORKDIR /app

# Copiar TUDO primeiro para garantir que a estrutura está completa
COPY . .

# Verificar se a estrutura está correta
RUN ls -la && \
    echo "Verificando estrutura..." && \
    ls -la packages/backend/ || echo "ERRO: packages/backend não encontrado!"

# Mover para o diretório do backend
WORKDIR /app/packages/backend

# Verificar se package.json existe
RUN if [ ! -f package.json ]; then \
      echo "ERRO: package.json não encontrado!" && \
      exit 1; \
    fi

# Instalar dependências (incluindo devDependencies para build)
RUN if [ -f package-lock.json ]; then \
      echo "Usando package-lock.json" && npm ci; \
    else \
      echo "Gerando package-lock.json" && npm install; \
    fi

# Build TypeScript
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copiar package.json e package-lock.json do backend
COPY packages/backend/package.json ./
COPY packages/backend/package-lock.json* ./

# Instalar apenas dependências de produção
RUN if [ -f package-lock.json ]; then \
      npm ci --omit=dev; \
    else \
      npm install --omit=dev; \
    fi

# Copiar arquivos compilados do builder
COPY --from=builder /app/packages/backend/dist ./dist

# Copiar outros arquivos necessários (se houver)
COPY --from=builder /app/packages/backend/package.json ./package.json

# Expor porta
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:3001/health || exit 1

# Iniciar servidor
CMD ["npm", "start"]
