# 🚀 COMEÇAR AQUI - Sistema Pronto para Testes

## ✅ O que foi feito

1. **Infraestrutura completa**
   - Docker Compose configurado
   - 10 migrations SQL convertidas
   - Banco PostgreSQL pronto

2. **Backend API funcionando**
   - Autenticação JWT completa
   - Endpoints: Auth, Products, Clients, Leads, Funnels, Dashboard, Profile
   - Middleware de segurança

3. **Frontend migrado**
   - Login/Register funcionando
   - Products, Clients, Leads migrados
   - Cliente API configurado

4. **Deploy preparado**
   - Dockerfiles criados
   - docker-compose.prod.yml pronto
   - Nginx configurado
   - Documentação completa

## 🎯 TESTAR AGORA (1 comando!)

### Opção 1: Script Único (Recomendado) ⚡

**Windows:**
```powershell
.\scripts\start.ps1
```

**Linux/Mac:**
```bash
./scripts/start.sh
```

O script faz tudo automaticamente:
- ✅ Inicia Docker (PostgreSQL)
- ✅ Instala dependências (se necessário)
- ✅ Inicia Backend
- ✅ Inicia Frontend

### Opção 2: Manual

### 1. Iniciar PostgreSQL
```bash
docker-compose up -d postgres
```

### 2. Criar .env
Crie `.env` na raiz:
```env
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=painelcrm
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
JWT_SECRET=dev-secret-key
JWT_EXPIRES_IN=7d
API_PORT=3001
VITE_API_URL=http://localhost:3001
```

### 3. Instalar e Iniciar

**Terminal 1 - Backend:**
```bash
cd packages/backend
npm install
npm run dev
```

**Terminal 2 - Frontend:**
```bash
npm install
npm run dev
```

### 4. Acessar
- Frontend: http://localhost:5173
- Backend: http://localhost:3001/health

> 💡 **Dica**: Use o script único (`.\scripts\start.ps1` ou `./scripts/start.sh`) para iniciar tudo de uma vez! Veja `README-START.md` para mais detalhes.

## ✅ Funcionalidades Testáveis

- ✅ Registro de usuário
- ✅ Login/Logout  
- ✅ Dashboard básico
- ✅ Criar/Listar/Editar/Deletar Leads
- ✅ Criar/Listar/Editar/Deletar Clients
- ✅ Criar/Listar Products
- ✅ Criar/Listar Funnels

## 📚 Documentação

- `SETUP-LOCAL.md` - Setup detalhado local
- `DEPLOY.md` - Deploy completo em VPS
- `QUICK-START.md` - Início rápido
- `README-SETUP.md` - Resumo completo

## 🚢 Para Deploy em VPS

Siga `DEPLOY.md` - está tudo pronto!

## ⚠️ Ainda Pendente (não crítico para testes)

- Algumas páginas ainda usam Supabase (funcionarão parcialmente)
- Endpoints de Cart/Orders (se usar loja)
- Endpoints de Contracts, Projects, Tickets (se usar)

## 🎉 Pronto para Testar!

O sistema está funcional para testes básicos. Siga os passos acima e comece a testar!

