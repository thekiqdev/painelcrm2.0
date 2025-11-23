# Progresso da Migração Supabase → PostgreSQL

## ✅ Concluído

### 1. Infraestrutura
- [x] Docker Compose com PostgreSQL configurado
- [x] 10 migrations SQL convertidas (removidas dependências Supabase)
- [x] Tabela `users` própria criada
- [x] Sistema de sessões JWT implementado

### 2. Backend API
- [x] Estrutura Node.js/Express criada
- [x] Autenticação JWT completa (`/api/auth/*`)
- [x] Endpoints de Products (`/api/products/*`)
- [x] Endpoints de Clients (`/api/clients/*`)
- [x] Endpoints de Profile (`/api/profile/*`)
- [x] Endpoints de Registration Steps (`/api/registration-steps/*`)
- [x] Middleware de autenticação
- [x] Validação com Zod

### 3. Frontend - Cliente API
- [x] Cliente HTTP criado (`src/integrations/api/client.ts`)
- [x] AuthContext migrado para nova API
- [x] auth-helpers migrado para nova API
- [x] ProductsService migrado para nova API
- [x] clients-helpers migrado para nova API

## 🔄 Em Progresso

### 4. Services do Frontend
- [ ] CartService - Parcialmente migrado (precisa endpoints no backend)
- [ ] WhatsApp services - Pendente
- [ ] Evolution API services - Pendente

## ⏳ Pendente

### 5. Endpoints Backend Faltantes
- [ ] Cart/Orders endpoints (`/api/cart/*`, `/api/orders/*`)
- [ ] Leads endpoints (`/api/leads/*`)
- [ ] Funnels endpoints (`/api/funnels/*`)
- [ ] Contracts endpoints (`/api/contracts/*`)
- [ ] Projects endpoints (`/api/projects/*`)
- [ ] Tickets endpoints (`/api/tickets/*`)
- [ ] WhatsApp endpoints (`/api/whatsapp/*`)
- [ ] Store Profile endpoints (`/api/store-profile/*`)
- [ ] User Profiles endpoints (`/api/user-profiles/*`)

### 6. Páginas e Componentes
- [ ] Atualizar todas as páginas que usam `supabase.from()` diretamente
- [ ] Migrar componentes que fazem queries diretas ao Supabase
- [ ] Atualizar hooks customizados (useCurrentUser, useFunnelData, etc.)

### 7. Edge Functions
- [ ] Converter `whatsapp-connection` para endpoint `/api/whatsapp/connection`
- [ ] Converter `evolution-webhook` para endpoint `/api/whatsapp/webhook`

### 8. Limpeza Final
- [ ] Remover `@supabase/supabase-js` do package.json
- [ ] Remover arquivo `src/integrations/supabase/client.ts`
- [ ] Atualizar tipos TypeScript (remover tipos do Supabase)
- [ ] Atualizar imports em todos os arquivos

### 9. Testes
- [ ] Testar autenticação completa
- [ ] Testar CRUD de todas as entidades
- [ ] Testar segurança (middleware de auth)
- [ ] Testar Edge Functions convertidas

## 📝 Notas Importantes

1. **Cart Service**: O CartService ainda precisa de endpoints no backend. Criar:
   - `POST /api/cart` - Criar/obter carrinho
   - `POST /api/cart/items` - Adicionar item
   - `PATCH /api/cart/items/:id` - Atualizar quantidade
   - `DELETE /api/cart/items/:id` - Remover item
   - `GET /api/cart/items` - Listar itens
   - `POST /api/orders` - Criar pedido

2. **RLS → Middleware**: Todas as políticas RLS foram removidas. A segurança agora é implementada no backend através do middleware `authenticateToken` que verifica o JWT e garante que o `user_id` está correto.

3. **Tipos TypeScript**: Os tipos do Supabase ainda estão sendo usados em alguns lugares. Será necessário gerar novos tipos baseados no schema PostgreSQL ou criar manualmente.

4. **Migrations**: As migrations foram convertidas mas podem precisar de ajustes finos. Testar a criação do banco do zero.

## 🚀 Próximos Passos Recomendados

1. Criar endpoints de Cart/Orders no backend
2. Migrar CartService no frontend
3. Criar endpoints para Leads, Funnels, Contracts, Projects, Tickets
4. Migrar páginas uma por uma, testando cada migração
5. Converter Edge Functions
6. Remover dependências do Supabase
7. Testes finais

