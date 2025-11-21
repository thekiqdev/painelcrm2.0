# Deploy Rápido no Easypanel

## Qual Dockerfile usar?

O Easypanel pede **um Dockerfile por serviço**. Você precisa criar **2 serviços**:

### 1. Serviço Backend (API)

**Nome do Dockerfile**: `Dockerfile`

**Configuração**:
- Tipo: App
- Porta: 3001
- Dockerfile: `Dockerfile` (raiz do projeto)
- Contexto: Raiz do repositório

**Variáveis de Ambiente**:
```
NODE_ENV=production
POSTGRES_HOST=<nome-do-servico-postgres>
POSTGRES_PORT=5432
POSTGRES_DB=painelcrm
POSTGRES_USER=postgres
POSTGRES_PASSWORD=<sua-senha>
JWT_SECRET=<gere-um-secret-forte>
JWT_EXPIRES_IN=7d
API_PORT=3001
FRONTEND_URL=https://seu-dominio.com
```

### 2. Serviço Frontend (Web)

**Nome do Dockerfile**: `Dockerfile.frontend`

**Configuração**:
- Tipo: App
- Porta: 80
- Dockerfile: `Dockerfile.frontend` (raiz do projeto)
- Contexto: Raiz do repositório

**Variáveis de Ambiente**:
```
VITE_API_URL=https://api.seu-dominio.com/api
```

### 3. Serviço PostgreSQL (Database)

**Configuração**:
- Tipo: PostgreSQL
- Versão: 15
- Variáveis:
  - `POSTGRES_USER`: postgres
  - `POSTGRES_PASSWORD`: <sua-senha>
  - `POSTGRES_DB`: painelcrm

## Passo a Passo

1. **Crie o serviço PostgreSQL primeiro**
   - Nome: `painelcrm-db`
   - Anote o nome do serviço (será usado no `POSTGRES_HOST`)

2. **Crie o serviço Backend**
   - Use o Dockerfile: `Dockerfile`
   - Configure as variáveis de ambiente
   - `POSTGRES_HOST` = nome do serviço PostgreSQL criado

3. **Crie o serviço Frontend**
   - Use o Dockerfile: `Dockerfile.frontend`
   - Configure `VITE_API_URL` com a URL do seu backend

4. **Configure domínios no Easypanel**
   - Frontend: `seu-dominio.com`
   - Backend: `api.seu-dominio.com`

5. **Inicialize o banco de dados**
   - Execute os scripts SQL em `database/init/` na ordem

## Arquivos Importantes

- ✅ `Dockerfile` - Para o backend
- ✅ `Dockerfile.frontend` - Para o frontend
- ✅ `nginx.conf.prod` - Configuração do nginx (já copiado no Dockerfile.frontend)
- ✅ `EASYPANEL-DEPLOY.md` - Guia completo

## Dica

Se o Easypanel pedir apenas **um nome de Dockerfile**, você pode:
1. Criar o serviço Backend primeiro usando `Dockerfile`
2. Depois criar o serviço Frontend usando `Dockerfile.frontend`

Ou renomeie temporariamente:
- Para backend: renomeie `Dockerfile` para o nome que o Easypanel pedir
- Para frontend: renomeie `Dockerfile.frontend` para o nome que o Easypanel pedir

