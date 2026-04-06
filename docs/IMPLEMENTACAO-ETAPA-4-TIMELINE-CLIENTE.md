# Implementação — Etapa 4 Timeline do Cliente

## 1. O que foi implementado
- Infraestrutura de eventos de domínio do cliente com persistência append-only e tenant-scoped.
- Emissão inicial de eventos de chat e financeiro nos pontos já existentes do domínio.
- Nova aba/menu `Timeline` no perfil do cliente com listagem decrescente e descrição amigável.
- Endpoint seguro para consulta da timeline por cliente e endpoint de emissão controlada para eventos do chat no frontend.

## 2. Eventos criados
- `chat_match_client_success`
- `chat_link_manual`
- `chat_link_auto_effective`
- `chat_link_migrated_lead_to_client`
- `chat_invoice_sent`
- `chat_invoice_created`
- `invoice_paid`

## 3. Onde os eventos são emitidos
- `chat_match_client_success` + `chat_link_auto_effective`
  - Em `upsertConversation` quando o vínculo automático do chat efetiva cliente.
- `chat_link_manual`
  - Em `linkConversation` quando o vínculo manual é definido para cliente.
- `chat_link_migrated_lead_to_client`
  - Em `migrateConversationLeadToClient` na migração explícita lead -> cliente.
- `chat_invoice_created`
  - No fluxo de criação de fatura no chat após criação bem-sucedida.
- `chat_invoice_sent`
  - No fluxo de envio da mensagem de fatura pelo chat/WhatsApp.
- `invoice_paid`
  - Em pontos confiáveis de confirmação de pagamento no domínio de webhook.

## 4. Estrutura de persistência
- Nova tabela `client_timeline_events`:
  - `tenant_id`, `client_id`, `event_name`, `source`, `actor_type`, `actor_id`,
    `reference_type`, `reference_id`, `metadata`, `created_at`.
- Índices para leitura por cliente/tenant em ordem temporal.
- Estratégia de deduplicação com `event_key` único (parcial) para evitar duplicidade indevida.
- Modelo append-only: não há sobrescrita de histórico.

## 5. Arquivos alterados
- `database/init/86_client_timeline_events.sql`
- `packages/backend/src/migrate.ts`
- `packages/backend/src/services/clientTimelineEventsService.ts`
- `packages/backend/src/controllers/clientsController.ts`
- `packages/backend/src/routes/clientsRoutes.ts`
- `packages/backend/src/controllers/chatController.ts`
- `packages/backend/src/services/conversationLinkService.ts`
- `packages/backend/src/modules/payments/webhook/paymentDomainService.ts`
- `src/services/clients.ts`
- `src/components/clients/ClientSidebar.tsx`
- `src/pages/ClientProfile.tsx`
- `src/pages/Chat.tsx`

## 6. Como funciona a aba Timeline
- A navegação do perfil do cliente agora possui item `Timeline`.
- A aba consulta `/api/clients/:id/timeline` e lista eventos por `created_at DESC`.
- Cada item mostra:
  - descrição amigável do evento,
  - data/hora,
  - origem (`source`),
  - referência quando existir.
- A implementação está preparada para incluir link direto por `reference_type/reference_id` em evolução futura.

## 7. Riscos e limitações
- Eventos de `chat_invoice_created` e `chat_invoice_sent` são disparados na orquestração do chat (frontend), persistidos no backend via endpoint dedicado.
- Não há automações/n8n nesta etapa (intencional).
- Mapeamento de descrições amigáveis ainda é estático no frontend e pode ser expandido.
- Em caso de fluxos externos ao chat para criação/envio de fatura, não há emissão desses dois eventos específicos nesta etapa.

## 8. Como validar manualmente
1. Vincular conversa automaticamente via sync e confirmar evento na aba Timeline do cliente.
2. Vincular conversa manualmente para cliente e confirmar evento `chat_link_manual`.
3. Converter lead para cliente (com migração de conversa) e confirmar evento correspondente.
4. Criar fatura pelo chat e confirmar evento `chat_invoice_created`.
5. Enviar fatura pelo chat/WhatsApp e confirmar evento `chat_invoice_sent`.
6. Confirmar pagamento de fatura e validar evento `invoice_paid`.
7. Validar ordenação decrescente por data/hora.
8. Validar isolamento tenant-scoped (sem eventos cruzados entre tenants).
