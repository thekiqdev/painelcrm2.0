# Quick Start - Sistema Funcionando Localmente

## 🚀 Início Rápido (5 minutos)

### 1. Iniciar PostgreSQL
```bash
docker-compose up -d postgres
```

### 2. Configurar Ambiente
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

### 3. Instalar e Iniciar Backend
```bash
cd packages/backend
npm install
npm run dev
```

### 4. Instalar e Iniciar Frontend (outro terminal)
```bash
npm install
npm run dev
```

### 5. Acessar
- Frontend: http://localhost:5173
- Backend API: http://localhost:3001
- Health Check: http://localhost:3001/health

## ✅ O que já está funcionando

- ✅ Autenticação (Login/Register)
- ✅ Dashboard básico
- ✅ CRUD de Products
- ✅ CRUD de Clients
- ✅ CRUD de Leads (endpoints criados)
- ✅ CRUD de Funnels (endpoints criados)
- ✅ Perfil do usuário

## ⚠️ O que ainda precisa ser feito

### Para funcionar completamente:
1. Atualizar páginas que ainda usam Supabase diretamente:
   - `src/pages/Leads.tsx` - Migrar para usar apiClient
   - `src/pages/Clients.tsx` - Já usa clients-helpers (OK)
   - Outras páginas conforme necessário

2. Criar endpoints faltantes:
   - Cart/Orders (se usar loja)
   - Contracts (se usar contratos)
   - Projects (se usar projetos)
   - Tickets (se usar tickets)

### Para deploy em VPS:
1. Seguir `DEPLOY.md`
2. Configurar domínio e HTTPS
3. Configurar backups

## 🧪 Testar Localmente

1. **Registro:**
   - Acesse http://localhost:5173
   - Clique em "Registre-se"
   - Preencha WhatsApp e senha
   - Deve criar conta e redirecionar

2. **Login:**
   - Faça logout
   - Faça login novamente
   - Deve funcionar

3. **Dashboard:**
   - Deve carregar sem erros
   - Pode estar vazio (normal)

4. **Leads:**
   - Criar um lead
   - Listar leads
   - Editar lead
   - Deletar lead

5. **Clients:**
   - Criar um cliente
   - Listar clientes

## 🔍 Verificar se está funcionando

```bash
# Health check
curl http://localhost:3001/health

# Verificar banco
docker-compose exec postgres psql -U postgres -d painelcrm -c "\dt"

# Ver logs do backend
cd packages/backend
npm run dev
# Deve mostrar: "Server running on port 3001"
```

## 📝 Próximos Passos

1. Testar fluxo completo localmente
2. Corrigir erros encontrados
3. Migrar páginas restantes
4. Preparar para VPS (ver DEPLOY.md)

