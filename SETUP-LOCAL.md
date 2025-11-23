# Setup Local - Guia Rápido

## Pré-requisitos

- Node.js 20+ instalado
- Docker Desktop instalado e rodando
- Git instalado

## Passo 1: Iniciar Banco de Dados

```bash
# Iniciar PostgreSQL
docker-compose up -d postgres

# Verificar se está rodando
docker-compose ps
```

## Passo 2: Configurar Variáveis de Ambiente

Crie um arquivo `.env` na raiz do projeto:

```env
# PostgreSQL
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=painelcrm
POSTGRES_HOST=localhost
POSTGRES_PORT=5432

# JWT
JWT_SECRET=dev-secret-key-change-in-production
JWT_EXPIRES_IN=7d

# API
API_PORT=3001
NODE_ENV=development
FRONTEND_URL=http://localhost:5173

# Frontend
VITE_API_URL=http://localhost:3001
```

## Passo 3: Instalar Dependências

### Backend
```bash
cd packages/backend
npm install
cd ../..
```

### Frontend
```bash
npm install
```

## Passo 4: Iniciar Servidores

### Terminal 1 - Backend
```bash
cd packages/backend
npm run dev
```

O backend estará rodando em `http://localhost:3001`

### Terminal 2 - Frontend
```bash
npm run dev
```

O frontend estará rodando em `http://localhost:5173`

## Passo 5: Testar

1. Acesse `http://localhost:5173`
2. Clique em "Registre-se"
3. Crie uma conta com WhatsApp e senha
4. Faça login
5. Acesse o dashboard

## Verificar Saúde do Sistema

```bash
# Health check da API
curl http://localhost:3001/health

# Verificar banco de dados
docker-compose exec postgres psql -U postgres -d painelcrm -c "SELECT COUNT(*) FROM users;"
```

## Scripts Automatizados

### Windows (PowerShell)
```powershell
.\scripts\dev.ps1
```

### Linux/Mac
```bash
chmod +x scripts/dev.sh
./scripts/dev.sh
```

## Problemas Comuns

### Erro: "Cannot connect to database"
- Verifique se Docker está rodando
- Verifique se PostgreSQL está iniciado: `docker-compose ps`
- Verifique as credenciais no `.env`

### Erro: "Port already in use"
- Backend: Altere `API_PORT` no `.env`
- Frontend: Altere a porta no `vite.config.ts`

### Erro: "Module not found"
- Execute `npm install` novamente
- Delete `node_modules` e `package-lock.json` e reinstale

## Próximos Passos

Após o sistema estar funcionando localmente:
1. Testar todas as funcionalidades básicas
2. Verificar logs para erros
3. Preparar para deploy na VPS (ver DEPLOY.md)

