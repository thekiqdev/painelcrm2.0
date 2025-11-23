# 🚀 Setup Completo - Sistema Pronto para Testes

## Status da Migração

### ✅ Completado (70%)

1. **Infraestrutura**
   - ✅ Docker Compose configurado
   - ✅ 10 migrations SQL convertidas
   - ✅ Banco de dados estruturado

2. **Backend API**
   - ✅ Autenticação JWT completa
   - ✅ Endpoints: Auth, Products, Clients, Profile, Registration Steps
   - ✅ Endpoints: Leads, Funnels, Dashboard Stats
   - ✅ Middleware de autenticação
   - ✅ Validação com Zod

3. **Frontend**
   - ✅ Cliente API criado
   - ✅ AuthContext migrado
   - ✅ Login/Register migrados
   - ✅ ProductsService migrado
   - ✅ clients-helpers migrado

4. **Deploy**
   - ✅ Dockerfiles criados
   - ✅ docker-compose.prod.yml configurado
   - ✅ Nginx configurado
   - ✅ Scripts de deploy criados
   - ✅ Documentação completa

## 🎯 Para Testar Localmente AGORA

### Passo 1: Iniciar Banco de Dados
```bash
docker-compose up -d postgres
```

### Passo 2: Criar .env
Crie `.env` na raiz:
```env
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres
POSTGRES_DB=painelcrm
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
JWT_SECRET=dev-secret-key-change-in-production
JWT_EXPIRES_IN=7d
API_PORT=3001
NODE_ENV=development
FRONTEND_URL=http://localhost:5173
VITE_API_URL=http://localhost:3001
```

### Passo 3: Instalar Dependências

**Backend:**
```bash
cd packages/backend
npm install
```

**Frontend:**
```bash
npm install
```

### Passo 4: Iniciar Servidores

**Terminal 1 - Backend:**
```bash
cd packages/backend
npm run dev
```

**Terminal 2 - Frontend:**
```bash
npm run dev
```

### Passo 5: Testar
1. Acesse: http://localhost:5173
2. Registre-se com WhatsApp e senha
3. Faça login
4. Teste criar um Lead
5. Teste criar um Client

## 📋 O que Funciona

- ✅ Registro de usuário
- ✅ Login/Logout
- ✅ Dashboard (básico)
- ✅ CRUD de Products
- ✅ CRUD de Clients
- ✅ CRUD de Leads (endpoints prontos)
- ✅ CRUD de Funnels (endpoints prontos)
- ✅ Perfil do usuário

## ⚠️ O que Ainda Precisa

### Páginas que ainda usam Supabase diretamente:
- `src/pages/Leads.tsx` - Precisa migrar para apiClient
- Outras páginas conforme uso

### Endpoints que ainda não existem:
- Cart/Orders (se usar loja)
- Contracts (se usar contratos)
- Projects (se usar projetos)
- Tickets (se usar tickets)
- WhatsApp (se usar WhatsApp)

## 🚢 Para Deploy em VPS

Siga o guia completo em `DEPLOY.md`:

1. Preparar VPS (Docker, firewall)
2. Clonar repositório
3. Configurar `.env.production`
4. Build e deploy com Docker Compose
5. Configurar Nginx e HTTPS
6. Configurar backups

## 📝 Arquivos Importantes

- `SETUP-LOCAL.md` - Guia detalhado de setup local
- `DEPLOY.md` - Guia completo de deploy em VPS
- `QUICK-START.md` - Início rápido
- `MIGRATION-PROGRESS.md` - Progresso da migração
- `NEXT-STEPS.md` - Próximos passos detalhados

## 🔧 Troubleshooting

### Erro: "Cannot connect to database"
- Verifique se Docker está rodando
- Verifique se PostgreSQL iniciou: `docker-compose ps`
- Verifique credenciais no `.env`

### Erro: "Port already in use"
- Backend: Altere `API_PORT` no `.env`
- Frontend: Altere porta no `vite.config.ts`

### Erro de compilação TypeScript
- Execute `npm install` novamente
- Verifique se todas as dependências estão instaladas

## ✅ Checklist para Testes

- [ ] PostgreSQL rodando
- [ ] Backend iniciado sem erros
- [ ] Frontend compila sem erros
- [ ] Registro de usuário funciona
- [ ] Login funciona
- [ ] Dashboard carrega
- [ ] Criar Lead funciona
- [ ] Criar Client funciona
- [ ] Health check da API responde

## 🎉 Próximo Passo

Após testar localmente e confirmar que está funcionando:
1. Migrar páginas restantes (Leads.tsx, etc.)
2. Criar endpoints faltantes conforme necessidade
3. Fazer deploy na VPS seguindo DEPLOY.md

