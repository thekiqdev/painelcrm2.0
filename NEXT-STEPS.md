# Próximos Passos da Migração

## Status Atual

### ✅ Completado (60% da migração)

1. **Infraestrutura Base**
   - Docker Compose configurado
   - 10 migrations SQL convertidas
   - Banco de dados estruturado

2. **Backend API - Autenticação e Core**
   - Sistema de autenticação JWT completo
   - Endpoints: `/api/auth/*`, `/api/products/*`, `/api/clients/*`, `/api/profile/*`, `/api/registration-steps/*`
   - Middleware de autenticação
   - Validação com Zod

3. **Frontend - Core Services**
   - Cliente API criado
   - AuthContext migrado
   - auth-helpers migrado
   - ProductsService migrado
   - clients-helpers migrado

### 🔄 Próximas Tarefas Prioritárias

#### 1. Completar Endpoints do Backend (Alta Prioridade)

**Cart/Orders:**
```typescript
// packages/backend/src/controllers/cartController.ts
- POST /api/cart - Criar/obter carrinho
- POST /api/cart/items - Adicionar item ao carrinho
- PATCH /api/cart/items/:id - Atualizar quantidade
- DELETE /api/cart/items/:id - Remover item
- GET /api/cart/items - Listar itens do carrinho
- POST /api/orders - Criar pedido
- GET /api/orders - Listar pedidos
```

**Leads:**
```typescript
// packages/backend/src/controllers/leadsController.ts
- GET /api/leads
- GET /api/leads/:id
- POST /api/leads
- PATCH /api/leads/:id
- DELETE /api/leads/:id
```

**Funnels:**
```typescript
// packages/backend/src/controllers/funnelsController.ts
- GET /api/funnels
- POST /api/funnels
- GET /api/funnels/:id
- PATCH /api/funnels/:id
- DELETE /api/funnels/:id
- GET /api/funnels/:id/stages
- POST /api/funnels/:id/stages
```

**Contracts, Projects, Tickets** - Seguir mesmo padrão

#### 2. Migrar Services do Frontend

**Cart Service:**
```typescript
// src/services/cart.ts
- Substituir todas as chamadas supabase.* por apiClient.*
- Atualizar getOrCreateCart, addToCart, etc.
```

**WhatsApp Services:**
```typescript
// src/services/whatsapp/*
- Migrar connectionService.ts
- Migrar connectionDatabaseService.ts
- Migrar evolutionApi.ts
```

#### 3. Atualizar Páginas (20 arquivos restantes)

Arquivos que ainda usam Supabase diretamente:
- src/pages/Login.tsx
- src/pages/Register.tsx
- src/pages/Leads.tsx
- src/pages/Clients.tsx
- src/pages/Contracts.tsx
- src/pages/Tickets.tsx
- src/pages/Projects.tsx
- E mais 13 arquivos...

**Estratégia:**
1. Identificar qual endpoint da API cada página precisa
2. Criar o endpoint no backend se não existir
3. Substituir `supabase.from()` por `apiClient.get/post/patch/delete()`
4. Testar cada página após migração

#### 4. Converter Edge Functions

**WhatsApp Connection:**
```typescript
// Criar: packages/backend/src/controllers/whatsappController.ts
POST /api/whatsapp/connection
GET /api/whatsapp/connection/:id
DELETE /api/whatsapp/connection/:id
```

**Evolution Webhook:**
```typescript
POST /api/whatsapp/webhook
// Migrar lógica de supabase/functions/evolution-webhook/index.ts
```

#### 5. Limpeza Final

1. Remover `@supabase/supabase-js` do package.json
2. Deletar `src/integrations/supabase/client.ts`
3. Atualizar tipos TypeScript
4. Remover imports não utilizados

## Comandos Úteis

### Iniciar o ambiente
```bash
# Iniciar PostgreSQL
docker-compose up -d

# Instalar dependências do backend
cd packages/backend
npm install

# Iniciar backend
npm run dev

# Em outro terminal, iniciar frontend
npm run dev
```

### Verificar arquivos que ainda usam Supabase
```bash
grep -r "from.*supabase" src/
grep -r "import.*supabase" src/
grep -r "supabase\." src/
```

## Estrutura de Endpoints Criada

```
/api/auth
  POST /register
  POST /login
  GET /me
  POST /logout

/api/products
  GET /
  GET /:id
  POST /
  PATCH /:id
  DELETE /:id
  GET /public/:userId

/api/clients
  GET /
  GET /:id
  POST /
  PATCH /:id
  DELETE /:id

/api/profile
  GET /
  PATCH /

/api/registration-steps
  POST /
```

## Padrão para Criar Novos Endpoints

1. Criar controller em `packages/backend/src/controllers/[entity]Controller.ts`
2. Criar routes em `packages/backend/src/routes/[entity]Routes.ts`
3. Registrar routes em `packages/backend/src/index.ts`
4. Usar `authenticateToken` middleware para rotas protegidas
5. Validar dados com Zod
6. Usar `pool.query()` para queries SQL
7. Sempre verificar `user_id` para segurança

## Notas de Segurança

- Todas as queries devem filtrar por `user_id` do token JWT
- Nunca confiar em `user_id` vindo do cliente
- Usar `authenticateToken` middleware em todas as rotas protegidas
- Validar todos os inputs com Zod

