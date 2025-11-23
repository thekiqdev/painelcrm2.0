# Checklist de Migração - Supabase → PostgreSQL

Use este documento para marcar o progresso de cada etapa. Marque com ✅ quando concluído e testado.

---

## ✅ ETAPA 1: Autenticação e Perfil
- [x] Backend endpoints criados
- [x] AuthContext migrado
- [x] Login migrado
- [x] Registro migrado
- [x] RegistrationSteps migrado
- [x] Testado e funcionando

**Status**: ✅ CONCLUÍDO

---

## ✅ ETAPA 2: Produtos e Loja
- [x] Backend endpoints criados
- [x] Store Profile endpoints criados
- [x] ProductsService migrado
- [x] Products.tsx migrado
- [x] ProductForm.tsx migrado
- [x] PublicStore.tsx migrado
- [x] PublicProduct.tsx migrado
- [x] ProductFormDialog.tsx migrado
- [x] StoreConfigDialog.tsx migrado
- [x] Testado completamente

**Status**: ✅ CONCLUÍDO

---

## ✅ ETAPA 3: Clientes
- [x] Backend endpoints criados
- [x] Client Groups endpoints criados
- [x] clients-helpers migrado
- [x] Clients.tsx migrado
- [x] ClientGroupsSection migrado
- [x] clientsService criado
- [x] Testado completamente

**Status**: ✅ CONCLUÍDO

---

## ✅ ETAPA 4: Leads
- [x] Backend endpoints criados
- [x] Leads.tsx migrado
- [x] Testado e funcionando

**Status**: ✅ CONCLUÍDO

---

## ✅ ETAPA 5: Funnels
- [x] Backend endpoints criados
- [ ] FunnelDetails.tsx migrado
- [ ] funnel/utils.ts migrado
- [ ] Testado completamente

**Status**: 🔄 PARCIAL

---

## ⏳ ETAPA 6: Carrinho e Pedidos

### Backend
- [ ] `GET /api/cart/:storeUserId` - Obter ou criar carrinho
- [ ] `POST /api/cart/:storeUserId/items` - Adicionar item
- [ ] `PUT /api/cart/items/:itemId` - Atualizar quantidade
- [ ] `DELETE /api/cart/items/:itemId` - Remover item
- [ ] `DELETE /api/cart/:storeUserId` - Limpar carrinho
- [ ] `GET /api/cart/:storeUserId/items` - Listar itens
- [ ] `POST /api/orders` - Criar pedido
- [ ] `GET /api/orders` - Listar pedidos
- [ ] `GET /api/orders/:id` - Detalhes do pedido

### Frontend
- [ ] `src/services/cart.ts` migrado

### Testes
- [ ] Adicionar produto ao carrinho
- [ ] Atualizar quantidade
- [ ] Remover item
- [ ] Criar pedido
- [ ] Listar pedidos

**Status**: ⏳ PENDENTE

---

## ⏳ ETAPA 7: Tickets (Sistema de Suporte)

### Backend
- [ ] `GET /api/tickets` - Listar tickets
- [ ] `GET /api/tickets/:id` - Detalhes
- [ ] `POST /api/tickets` - Criar ticket
- [ ] `PUT /api/tickets/:id` - Atualizar
- [ ] `DELETE /api/tickets/:id` - Deletar
- [ ] `GET /api/tickets/:id/messages` - Listar mensagens
- [ ] `POST /api/tickets/:id/messages` - Adicionar mensagem
- [ ] `GET /api/ticket-categories` - Listar categorias
- [ ] `POST /api/ticket-categories` - Criar categoria
- [ ] `PUT /api/ticket-categories/:id` - Atualizar categoria
- [ ] `DELETE /api/ticket-categories/:id` - Deletar categoria

### Frontend
- [ ] `src/pages/Tickets.tsx` migrado
- [ ] `src/pages/NewTicket.tsx` migrado

### Testes
- [ ] Criar ticket
- [ ] Listar tickets
- [ ] Filtrar por status
- [ ] Adicionar mensagem
- [ ] Gerenciar categorias

**Status**: ⏳ PENDENTE

---

## ⏳ ETAPA 8: Contratos

### Backend
- [ ] `GET /api/contracts` - Listar contratos
- [ ] `GET /api/contracts/:id` - Detalhes
- [ ] `POST /api/contracts` - Criar contrato
- [ ] `PUT /api/contracts/:id` - Atualizar
- [ ] `DELETE /api/contracts/:id` - Deletar
- [ ] `GET /api/contracts/:id/signers` - Listar signatários
- [ ] `POST /api/contracts/:id/signers` - Adicionar signatário
- [ ] `PUT /api/contracts/signers/:signerId` - Atualizar signatário
- [ ] `DELETE /api/contracts/signers/:signerId` - Remover signatário
- [ ] `GET /api/contracts/:id/events` - Listar eventos
- [ ] `POST /api/contracts/:id/events` - Adicionar evento
- [ ] `GET /api/contract-templates` - Listar templates
- [ ] `POST /api/contract-templates` - Criar template
- [ ] `PUT /api/contract-templates/:id` - Atualizar template
- [ ] `DELETE /api/contract-templates/:id` - Deletar template

### Frontend
- [ ] `src/pages/Contracts.tsx` migrado
- [ ] `src/pages/NewContract.tsx` migrado
- [ ] `src/pages/ContractDetails.tsx` migrado

### Testes
- [ ] Criar contrato
- [ ] Adicionar signatários
- [ ] Listar contratos
- [ ] Filtrar por status
- [ ] Gerenciar templates

**Status**: ⏳ PENDENTE

---

## ⏳ ETAPA 9: Projetos e Templates

### Backend
- [ ] `GET /api/projects` - Listar projetos
- [ ] `GET /api/projects/:id` - Detalhes
- [ ] `POST /api/projects` - Criar projeto
- [ ] `PUT /api/projects/:id` - Atualizar
- [ ] `DELETE /api/projects/:id` - Deletar
- [ ] `GET /api/projects/:id/lists` - Listar listas
- [ ] `POST /api/projects/:id/lists` - Criar lista
- [ ] `PUT /api/projects/lists/:listId` - Atualizar lista
- [ ] `DELETE /api/projects/lists/:listId` - Deletar lista
- [ ] `GET /api/projects/lists/:listId/tasks` - Listar tarefas
- [ ] `POST /api/projects/lists/:listId/tasks` - Criar tarefa
- [ ] `PUT /api/projects/tasks/:taskId` - Atualizar tarefa
- [ ] `DELETE /api/projects/tasks/:taskId` - Deletar tarefa
- [ ] `GET /api/project-templates` - Listar templates
- [ ] `GET /api/project-templates/:id` - Detalhes do template
- [ ] `POST /api/project-templates` - Criar template
- [ ] `PUT /api/project-templates/:id` - Atualizar template
- [ ] `DELETE /api/project-templates/:id` - Deletar template
- [ ] `GET /api/project-templates/:id/stages` - Listar estágios
- [ ] `POST /api/project-templates/:id/stages` - Criar estágio
- [ ] `GET /api/project-templates/stages/:stageId/tasks` - Listar tarefas do estágio
- [ ] `POST /api/project-templates/stages/:stageId/tasks` - Criar tarefa no template

### Frontend
- [ ] `src/pages/ProjectTemplates.tsx` migrado
- [ ] `src/components/projects/templates/NewTemplateDialog.tsx` migrado
- [ ] `src/components/projects/templates/EditTemplateDialog.tsx` migrado
- [ ] `src/components/projects/SaveAsTemplateDialog.tsx` migrado

### Testes
- [ ] Criar template
- [ ] Criar projeto a partir de template
- [ ] Gerenciar tarefas
- [ ] Mover tarefas entre listas

**Status**: ⏳ PENDENTE

---

## ⏳ ETAPA 10: WhatsApp e Evolution API

### Backend
- [ ] `GET /api/whatsapp/connection` - Status da conexão
- [ ] `POST /api/whatsapp/connection/connect` - Conectar (Evolution)
- [ ] `POST /api/whatsapp/connection/connect-webjs` - Conectar (WebJS)
- [ ] `POST /api/whatsapp/connection/disconnect` - Desconectar
- [ ] `POST /api/whatsapp/connection/confirm` - Confirmar conexão
- [ ] `GET /api/whatsapp/connections` - Listar conexões
- [ ] `POST /api/whatsapp/connections` - Criar conexão
- [ ] `PUT /api/whatsapp/connections/:id` - Atualizar conexão
- [ ] `DELETE /api/whatsapp/connections/:id` - Deletar conexão
- [ ] `GET /api/evolution/config` - Obter configuração
- [ ] `POST /api/evolution/config` - Criar/atualizar configuração
- [ ] `GET /api/evolution/servers` - Listar servidores
- [ ] `POST /api/evolution/servers` - Criar servidor
- [ ] `PUT /api/evolution/servers/:id` - Atualizar servidor
- [ ] `DELETE /api/evolution/servers/:id` - Deletar servidor
- [ ] `POST /api/whatsapp/webhook` - Webhook Evolution API

### Frontend
- [ ] `src/services/whatsapp/connectionService.ts` migrado
- [ ] `src/services/whatsapp/connectionDatabaseService.ts` migrado
- [ ] `src/services/evolutionApi.ts` migrado

### Edge Functions Convertidas
- [ ] `whatsapp-connection` convertida para controller
- [ ] `evolution-webhook` convertida para controller

### Testes
- [ ] Conectar WhatsApp
- [ ] Verificar status
- [ ] Receber webhook
- [ ] Gerenciar servidores Evolution

**Status**: ⏳ PENDENTE

---

## ⏳ ETAPA 11: Chat

### Backend
- [ ] `GET /api/chat/conversations` - Listar conversas
- [ ] `GET /api/chat/conversations/:id` - Detalhes da conversa
- [ ] `GET /api/chat/conversations/:id/messages` - Listar mensagens
- [ ] `POST /api/chat/conversations/:id/messages` - Enviar mensagem
- [ ] `GET /api/chat/contacts` - Listar contatos

### Frontend
- [ ] `src/pages/Chat.tsx` migrado

### Testes
- [ ] Listar conversas
- [ ] Enviar mensagem
- [ ] Receber mensagem em tempo real

**Status**: ⏳ PENDENTE

---

## ⏳ ETAPA 12: Configurações e Administração

### Backend
- [ ] `GET /api/user-profiles` - Listar perfis
- [ ] `POST /api/user-profiles` - Criar perfil
- [ ] `PUT /api/user-profiles/:id` - Atualizar perfil
- [ ] `DELETE /api/user-profiles/:id` - Deletar perfil
- [ ] `GET /api/user-profiles/:id/members` - Listar membros
- [ ] `POST /api/user-profiles/:id/members` - Adicionar membro
- [ ] `PUT /api/user-profiles/members/:memberId` - Atualizar membro
- [ ] `DELETE /api/user-profiles/members/:memberId` - Remover membro
- [ ] `GET /api/user-profiles/members/:memberId/permissions` - Listar permissões
- [ ] `POST /api/user-profiles/members/:memberId/permissions` - Adicionar permissão
- [ ] `DELETE /api/user-profiles/members/:memberId/permissions/:permissionId` - Remover permissão
- [ ] `GET /api/client-groups` - Listar grupos
- [ ] `POST /api/client-groups` - Criar grupo
- [ ] `PUT /api/client-groups/:id` - Atualizar grupo
- [ ] `DELETE /api/client-groups/:id` - Deletar grupo
- [ ] `POST /api/lead-statuses` - Criar status
- [ ] `PUT /api/lead-statuses/:id` - Atualizar status
- [ ] `DELETE /api/lead-statuses/:id` - Deletar status

### Frontend
- [ ] `src/components/settings/UserManagementSection.tsx` migrado
- [ ] `src/components/settings/LeadsSection.tsx` migrado
- [ ] `src/components/settings/ClientGroupsSection.tsx` migrado

### Testes
- [ ] Criar perfil de usuário
- [ ] Adicionar membros
- [ ] Gerenciar permissões
- [ ] Gerenciar grupos de clientes
- [ ] Gerenciar status de leads

**Status**: ⏳ PENDENTE

---

## ⏳ ETAPA 13: Busca Global e Utilitários

### Backend
- [ ] `GET /api/search` - Busca global

### Frontend
- [ ] `src/layouts/AppLayout.tsx` - Busca migrada
- [ ] `src/hooks/useCurrentUser.tsx` - Migrado para AuthContext

### Testes
- [ ] Buscar por termo
- [ ] Filtrar por tipo
- [ ] Resultados corretos

**Status**: ⏳ PENDENTE

---

## ⏳ ETAPA 14: Funnel Details e Utils

### Backend
- [ ] `PUT /api/funnels/stages/:stageId` - Atualizar estágio
- [ ] `DELETE /api/funnels/stages/:stageId` - Deletar estágio
- [ ] `PUT /api/clients/:id/funnel-stage` - Atualizar estágio do cliente

### Frontend
- [ ] `src/pages/FunnelDetails.tsx` migrado
- [ ] `src/components/funnel/utils.ts` migrado

### Testes
- [ ] Visualizar funnel
- [ ] Mover clientes entre estágios
- [ ] Adicionar regras

**Status**: ⏳ PENDENTE

---

## ⏳ ETAPA 15: Limpeza Final

- [ ] Remover `@supabase/supabase-js` do package.json
- [ ] Deletar `src/integrations/supabase/client.ts`
- [ ] Deletar `src/integrations/supabase/types.ts` (ou manter se usado)
- [ ] Remover todos os imports de Supabase
- [ ] Remover variáveis de ambiente Supabase
- [ ] Deletar pasta `supabase/` (ou manter como referência)
- [ ] Atualizar documentação
- [ ] Teste completo do sistema
- [ ] Verificar que não há mais referências ao Supabase

**Status**: ⏳ PENDENTE

---

## 📊 Progresso Geral

**Concluído**: 4 etapas (1, 4 completas; 2, 3, 5 parciais)  
**Pendente**: 11 etapas  
**Total de Etapas**: 15

**Última Atualização**: 2025-01-20

