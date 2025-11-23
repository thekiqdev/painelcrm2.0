# Plano Completo de Migração Supabase → PostgreSQL

Este documento lista todas as funcionalidades que precisam ser migradas do Supabase para o nosso backend PostgreSQL, organizadas em etapas testáveis.

## 📊 Status Geral

- ✅ **Concluído**: Autenticação, Produtos, Clientes, Leads, Funnels, Carrinho e Pedidos, Tickets, Contratos, Templates de Projetos
- 🔄 **Em Progresso**: Nenhum
- ⏳ **Pendente**: 13 módulos principais

---

## ✅ ETAPA 1: Autenticação e Perfil (CONCLUÍDO)

**Status**: ✅ Completo e testado

**Arquivos Migrados**:
- `src/contexts/AuthContext.tsx` ✅
- `src/utils/auth-helpers.ts` ✅
- `src/pages/Login.tsx` ✅
- `src/pages/Register.tsx` ✅
- `src/pages/AuthWhatsApp.tsx` ✅
- `src/pages/Registration/RegistrationSteps.tsx` ✅

**Backend Endpoints**:
- `POST /api/auth/register` ✅
- `POST /api/auth/login` ✅
- `POST /api/auth/logout` ✅
- `GET /api/auth/me` ✅
- `GET /api/profile` ✅
- `PUT /api/profile` ✅
- `PUT /api/registration-steps/:step` ✅

**Teste**: Login, registro e perfil funcionando corretamente.

---

## ✅ ETAPA 2: Produtos e Loja (CONCLUÍDO)

**Status**: ✅ Completo e testado

**Arquivos Migrados**:
- `src/services/products.ts` ✅
- `src/pages/Products.tsx` ✅
- `src/pages/ProductForm.tsx` ✅
- `src/pages/PublicStore.tsx` ✅
- `src/pages/PublicProduct.tsx` ✅
- `src/components/products/ProductFormDialog.tsx` ✅
- `src/components/products/StoreConfigDialog.tsx` ✅

**Backend Endpoints**:
- `GET /api/products` ✅
- `GET /api/products/:id` ✅
- `POST /api/products` ✅
- `PATCH /api/products/:id` ✅
- `DELETE /api/products/:id` ✅
- `GET /api/products/public/:userId` ✅
- `GET /api/store-profile` ✅
- `POST /api/store-profile` ✅
- `PATCH /api/store-profile` ✅
- `GET /api/store-profile/public/:userId` ✅
- `GET /api/store-profile/public/slug/:slug` ✅

**Teste**: CRUD completo de produtos e perfil de loja funcionando. Páginas públicas funcionando.

---

## ✅ ETAPA 3: Clientes (CONCLUÍDO)

**Status**: ✅ Completo e testado

**Arquivos Migrados**:
- `src/utils/clients-helpers.ts` ✅
- `src/pages/Leads.tsx` ✅
- `src/pages/Clients.tsx` ✅
- `src/components/settings/ClientGroupsSection.tsx` ✅
- `src/services/clients.ts` ✅ (novo serviço)

**Backend Endpoints**:
- `GET /api/clients` ✅
- `GET /api/clients/:id` ✅
- `POST /api/clients` ✅
- `PATCH /api/clients/:id` ✅
- `DELETE /api/clients/:id` ✅
- `GET /api/clients/:id/tasks` ✅
- `POST /api/clients/tasks` ✅
- `PATCH /api/clients/tasks/:taskId` ✅
- `DELETE /api/clients/tasks/:taskId` ✅
- `GET /api/client-groups` ✅
- `GET /api/client-groups/:id` ✅
- `POST /api/client-groups` ✅
- `PATCH /api/client-groups/:id` ✅
- `DELETE /api/client-groups/:id` ✅

**Teste**: CRUD completo de clientes, tarefas e grupos funcionando.

---

## ✅ ETAPA 4: Leads (CONCLUÍDO)

**Status**: ✅ Completo

**Arquivos Migrados**:
- `src/pages/Leads.tsx` ✅

**Backend Endpoints**:
- `GET /api/leads` ✅
- `GET /api/leads/:id` ✅
- `POST /api/leads` ✅
- `PUT /api/leads/:id` ✅
- `DELETE /api/leads/:id` ✅
- `GET /api/lead-statuses` ✅
- `GET /api/leads/:id/tasks` ✅
- `POST /api/leads/:id/tasks` ✅
- `PUT /api/leads/tasks/:taskId` ✅
- `DELETE /api/leads/tasks/:taskId` ✅

**Teste**: CRUD de leads funcionando.

---

## ✅ ETAPA 5: Funnels (CONCLUÍDO)

**Status**: ✅ Completo

**Arquivos Migrados**:
- `src/services/funnels.ts` ✅ (NOVO - Serviço de funnels)
- `src/components/funnel/utils.ts` ✅
- `src/pages/FunnelDetails.tsx` ✅

**Backend Endpoints**:
- `GET /api/funnels` ✅
- `GET /api/funnels/:id` ✅
- `POST /api/funnels` ✅
- `PATCH /api/funnels/:id` ✅
- `DELETE /api/funnels/:id` ✅

**Teste**: CRUD de funnels funcionando.

---

## ✅ ETAPA 6: Carrinho e Pedidos (CONCLUÍDO)

**Status**: ✅ Completo

**Arquivos Migrados**:
- `src/services/cart.ts` ✅

**Backend Endpoints**:
- `GET /api/cart/:storeUserId` ✅
- `GET /api/cart/:storeUserId/items` ✅
- `POST /api/cart/:storeUserId/items` ✅
- `PATCH /api/cart/items/:itemId` ✅
- `DELETE /api/cart/items/:itemId` ✅
- `DELETE /api/cart/:storeUserId` ✅
- `POST /api/orders` ✅
- `GET /api/orders` ✅
- `GET /api/orders/:id` ✅

**Teste**: Adicionar produto ao carrinho, criar pedido, listar pedidos.

---

## ✅ ETAPA 7: Tickets (Sistema de Suporte) (CONCLUÍDO)

**Status**: ✅ Completo

**Arquivos Migrados**:
- `src/pages/Tickets.tsx` ✅
- `src/pages/NewTicket.tsx` ✅
- `src/services/tickets.ts` ✅ (novo serviço criado)

**Backend Endpoints**:
- `GET /api/tickets` ✅
- `GET /api/tickets/:id` ✅
- `POST /api/tickets` ✅
- `PATCH /api/tickets/:id` ✅
- `DELETE /api/tickets/:id` ✅
- `GET /api/tickets/:id/messages` ✅
- `POST /api/tickets/:id/messages` ✅
- `GET /api/ticket-categories` ✅
- `POST /api/ticket-categories` ✅
- `PATCH /api/ticket-categories/:id` ✅
- `DELETE /api/ticket-categories/:id` ✅

**Teste**: Criar ticket, listar tickets, filtrar por status, adicionar mensagem.

---

## ✅ ETAPA 8: Contratos (CONCLUÍDO)

**Status**: ✅ Completo

**Arquivos Migrados**:
- `src/pages/Contracts.tsx` ✅
- `src/pages/NewContract.tsx` ✅
- `src/pages/ContractDetails.tsx` ✅
- `src/services/contracts.ts` ✅ (novo serviço criado)

**Backend Endpoints**:
- `GET /api/contracts` ✅
- `GET /api/contracts/:id` ✅
- `POST /api/contracts` ✅
- `PATCH /api/contracts/:id` ✅
- `DELETE /api/contracts/:id` ✅
- `GET /api/contracts/:id/signers` ✅
- `POST /api/contracts/:id/signers` ✅
- `PATCH /api/contracts/signers/:signerId` ✅
- `DELETE /api/contracts/signers/:signerId` ✅
- `GET /api/contracts/:id/events` ✅
- `POST /api/contracts/:id/events` ✅
- `GET /api/contract-templates` ✅
- `POST /api/contract-templates` ✅
- `PATCH /api/contract-templates/:id` ✅
- `DELETE /api/contract-templates/:id` ✅

**Teste**: Criar contrato, adicionar signatários, listar contratos, filtrar por status.

---

## ✅ ETAPA 9: Projetos e Templates (CONCLUÍDO)

**Status**: ✅ Completo

**Arquivos Migrados**:
- `src/pages/ProjectTemplates.tsx` ✅
- `src/components/projects/templates/NewTemplateDialog.tsx` ✅
- `src/components/projects/templates/EditTemplateDialog.tsx` ✅
- `src/components/projects/SaveAsTemplateDialog.tsx` ✅
- `src/services/projectTemplates.ts` ✅ (novo serviço criado)

**Tabelas do Banco**:
- `projects`
- `project_lists`
- `project_tasks`
- `project_templates`
- `project_template_stages`
- `project_template_tasks`

**Backend Endpoints Criados** (Templates):
- `GET /api/project-templates` ✅
- `GET /api/project-templates/:id` ✅
- `POST /api/project-templates` ✅
- `PATCH /api/project-templates/:id` ✅
- `DELETE /api/project-templates/:id` ✅
- `GET /api/project-templates/:id/stages` ✅
- `POST /api/project-templates/:id/stages` ✅
- `POST /api/project-templates/stages/:stageId/tasks` ✅

**Backend Endpoints Criados** (Projetos completos):
- `GET /api/projects` ✅
- `GET /api/projects/:id` ✅
- `POST /api/projects` ✅
- `PATCH /api/projects/:id` ✅
- `DELETE /api/projects/:id` ✅
- `GET /api/projects/:projectId/lists` ✅
- `POST /api/projects/:projectId/lists` ✅
- `PATCH /api/projects/lists/:listId` ✅
- `DELETE /api/projects/lists/:listId` ✅
- `GET /api/projects/lists/:listId/tasks` ✅
- `GET /api/projects/tasks/:taskId` ✅
- `POST /api/projects/lists/:listId/tasks` ✅
- `PATCH /api/projects/tasks/:taskId` ✅
- `DELETE /api/projects/tasks/:taskId` ✅

**Frontend Migrado**:
- `src/services/projects.ts` ✅ (novo serviço criado)
- `src/pages/Projects.tsx` ✅ (migrado para usar apiClient)

**Teste**: Criar template, duplicar template, editar template com stages e tasks, salvar projeto como template.

---

## ⏳ ETAPA 10: WhatsApp e Evolution API

**Status**: ⏳ Pendente

**Arquivos que Precisam Migração**:
- `src/services/whatsapp/connectionService.ts` - Usa Supabase e Edge Functions
- `src/services/whatsapp/connectionDatabaseService.ts` - Usa Supabase
- `src/services/evolutionApi.ts` - Usa Supabase
- `supabase/functions/whatsapp-connection/index.ts` - Edge Function a converter
- `supabase/functions/evolution-webhook/index.ts` - Edge Function a converter

**Tabelas do Banco**:
- `evolution_api_configs`
- `evolution_servers`
- `whatsapp_connections`
- `conversation_attendances`
- `whatsapp_webhook_events`

**Backend Endpoints a Criar**:
- `GET /api/whatsapp/connection` - Status da conexão
- `POST /api/whatsapp/connection/connect` - Conectar WhatsApp (Evolution API)
- `POST /api/whatsapp/connection/connect-webjs` - Conectar WhatsApp (WebJS)
- `POST /api/whatsapp/connection/disconnect` - Desconectar
- `POST /api/whatsapp/connection/confirm` - Confirmar conexão
- `GET /api/whatsapp/connections` - Listar conexões
- `POST /api/whatsapp/connections` - Criar conexão
- `PUT /api/whatsapp/connections/:id` - Atualizar conexão
- `DELETE /api/whatsapp/connections/:id` - Deletar conexão
- `GET /api/evolution/config` - Obter configuração Evolution API
- `POST /api/evolution/config` - Criar/atualizar configuração
- `GET /api/evolution/servers` - Listar servidores Evolution
- `POST /api/evolution/servers` - Criar servidor Evolution
- `PUT /api/evolution/servers/:id` - Atualizar servidor
- `DELETE /api/evolution/servers/:id` - Deletar servidor
- `POST /api/whatsapp/webhook` - Webhook para eventos Evolution API

**Arquivos Frontend a Migrar**:
- `src/services/whatsapp/connectionService.ts` - Substituir chamadas Edge Functions por endpoints
- `src/services/whatsapp/connectionDatabaseService.ts` - Substituir Supabase por `apiClient`
- `src/services/evolutionApi.ts` - Substituir Supabase por `apiClient`

**Edge Functions a Converter**:
- `supabase/functions/whatsapp-connection/index.ts` → `packages/backend/src/controllers/whatsappController.ts`
- `supabase/functions/evolution-webhook/index.ts` → `packages/backend/src/controllers/webhookController.ts`

**Teste**: Conectar WhatsApp, verificar status, receber webhook.

---

## ⏳ ETAPA 11: Chat

**Status**: ⏳ Pendente

**Arquivos que Precisam Migração**:
- `src/pages/Chat.tsx` - Usa Supabase diretamente

**Tabelas do Banco**:
- `whatsapp_connections` (já existe)
- `conversation_attendances` (já existe)
- Possivelmente tabela de mensagens (verificar schema)

**Backend Endpoints a Criar**:
- `GET /api/chat/conversations` - Listar conversas
- `GET /api/chat/conversations/:id` - Detalhes da conversa
- `GET /api/chat/conversations/:id/messages` - Listar mensagens
- `POST /api/chat/conversations/:id/messages` - Enviar mensagem
- `GET /api/chat/contacts` - Listar contatos

**Arquivos Frontend a Migrar**:
- `src/pages/Chat.tsx` - Substituir Supabase por `apiClient`

**Teste**: Listar conversas, enviar mensagem, receber mensagem.

---

## ✅ ETAPA 12: Configurações e Administração

**Status**: ✅ Completo

**Arquivos Migrados**:
- `src/components/settings/UserManagementSection.tsx` ✅
- `src/components/settings/LeadsSection.tsx` ✅
- `src/components/settings/ClientGroupsSection.tsx` ✅ (já usava clientsService)
- `src/services/settings.ts` ✅ (novo serviço criado)

**Tabelas do Banco**:
- `user_profiles` (já existe)
- `profile_members` (já existe)
- `user_roles` (já existe)
- `user_permissions` (já existe)
- `client_groups` (já existe)
- `lead_statuses` (já existe)

**Backend Endpoints Criados**:
- `GET /api/user-profiles` ✅
- `GET /api/user-profiles/:id` ✅
- `POST /api/user-profiles` ✅
- `PATCH /api/user-profiles/:id` ✅
- `DELETE /api/user-profiles/:id` ✅
- `GET /api/user-profiles/:profileId/members` ✅
- `POST /api/user-profiles/:profileId/members` ✅
- `DELETE /api/user-profiles/members/:memberId` ✅
- `GET /api/user-profiles/members/:memberId/permissions` ✅
- `POST /api/user-profiles/members/:memberId/permissions` ✅
- `DELETE /api/user-profiles/members/:memberId/permissions/:permissionId` ✅
- `GET /api/client-groups` ✅ (já existia)
- `POST /api/client-groups` ✅ (já existia)
- `PATCH /api/client-groups/:id` ✅ (já existia)
- `DELETE /api/client-groups/:id` ✅ (já existia)
- `GET /api/lead-statuses` ✅ (já existia)
- `POST /api/lead-statuses` ✅ (já existia)
- `PUT /api/lead-statuses/:id` ✅ (adicionado)
- `DELETE /api/lead-statuses/:id` ✅ (adicionado)

**Teste**: Criar perfil de usuário, adicionar membros, gerenciar grupos de clientes, gerenciar status de leads.

---

## ✅ ETAPA 13: Busca Global e Utilitários

**Status**: ✅ Completo

**Arquivos Migrados**:
- `src/layouts/AppLayout.tsx` ✅
- `src/hooks/useCurrentUser.tsx` ✅
- `src/services/search.ts` ✅ (novo serviço criado)

**Backend Endpoints Criados**:
- `GET /api/search` ✅
  - Query params: `q` (termo de busca), `types` (filtro por tipo: clients,leads,contracts,products)

**Funcionalidades**:
- Busca global em clientes, leads, contratos e produtos
- Filtro por tipo de resultado
- Busca em tempo real com debounce
- Hook useCurrentUser migrado para usar AuthContext

**Teste**: Buscar por termo, filtrar por tipo, resultados corretos.

---

## ✅ ETAPA 14: Funnel Details e Utils

**Status**: ✅ Completo

**Arquivos Migrados**:
- `src/pages/FunnelDetails.tsx` ✅ (já estava usando serviços)
- `src/components/funnel/utils.ts` ✅ (já estava usando serviços)

**Backend Endpoints** (todos existem e estão funcionais):
- `GET /api/funnels/:id` ✅
- `GET /api/funnels/:id/stages` ✅
- `POST /api/funnels/:id/stages` ✅
- `PATCH /api/funnels/stages/:id` ✅
- `DELETE /api/funnels/stages/:id` ✅
- `GET /api/clients` ✅
- `PATCH /api/clients/:id` ✅ (suporta atualização de funnel_stage)

**Funcionalidades**:
- Visualização de funil com estágios
- Criação, edição e exclusão de estágios
- Movimentação de clientes entre estágios (drag and drop)
- Atualização de estágio do cliente no backend
- Gerenciamento de tags de clientes
- Gerenciamento de regras (preparado para implementação futura)

**Teste**: Visualizar funnel, mover clientes entre estágios, adicionar regras.

---

## ⏳ ETAPA 15: Limpeza Final

**Status**: ⏳ Pendente (fazer após todas as etapas anteriores)

**Tarefas**:
1. Remover dependência `@supabase/supabase-js` do `package.json`
2. Deletar arquivo `src/integrations/supabase/client.ts`
3. Deletar arquivo `src/integrations/supabase/types.ts` (ou manter se usado para tipos)
4. Remover imports de Supabase de todos os arquivos
5. Atualizar variáveis de ambiente (remover `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`)
6. Deletar pasta `supabase/` (ou manter apenas migrations como referência)
7. Atualizar documentação
8. Teste completo do sistema

**Teste**: Verificar que não há mais referências ao Supabase, sistema funcionando completamente.

---

## 📝 Notas Importantes

1. **Ordem de Execução**: Execute as etapas na ordem numérica. Cada etapa deve ser testada antes de passar para a próxima.

2. **Padrão de Migração**:
   - Criar endpoints no backend primeiro
   - Testar endpoints com Postman/Insomnia
   - Migrar frontend para usar `apiClient`
   - Testar funcionalidade completa
   - Marcar etapa como concluída

3. **Autenticação**: Todos os endpoints (exceto públicos) devem usar o middleware `authMiddleware` do backend.

4. **Validação**: Use `zod` para validar dados de entrada nos endpoints.

5. **Tratamento de Erros**: Padronize respostas de erro no backend e tratamento no frontend.

6. **Testes**: Para cada etapa, teste:
   - Criar registro
   - Listar registros
   - Atualizar registro
   - Deletar registro
   - Filtros e busca (se aplicável)

---

## 🎯 Resumo por Prioridade

**Alta Prioridade** (funcionalidades core):
- ETAPA 6: Carrinho e Pedidos
- ETAPA 7: Tickets
- ETAPA 8: Contratos
- ETAPA 12: Configurações

**Média Prioridade**:
- ETAPA 9: Projetos
- ETAPA 10: WhatsApp
- ETAPA 11: Chat
- ETAPA 13: Busca Global

**Baixa Prioridade** (pode ser feito por último):
- ETAPA 14: Funnel Details
- ETAPA 15: Limpeza Final

---

**Última Atualização**: 2025-01-20
**Próxima Etapa a Executar**: ETAPA 10 - WhatsApp e Evolution API

