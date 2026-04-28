# CHAT ENGINE — Auditoria Técnica e Plano de Evolução

Data: 2026-04-28  
Escopo: Chat WhatsApp (Uazapi), motor de notificações, base para multicanal e realtime.

## 1) Resumo executivo

O sistema já possui:

- Chat funcional com WebSocket (Socket.IO) e webhook Uazapi.
- Persistência local de conversas/mensagens/instâncias.
- Regras de identidade canônica em `chat_conversations` (`canonical_chat_id`, `display_name`, `avatar_url`).
- Integração com notificações internas.

Problemas confirmados:

- Nome da instância WhatsApp em alguns casos cai para nome técnico (`instance.name`), por extração/persistência incompleta do nome humano do provider.
- Foto da instância e de contatos depende de múltiplos payloads; há proteção parcial, mas ainda há cenários sem hidratação completa.
- Sync de histórico tem limites e gates que podem deixar lacunas em conversas antigas.
- Realtime está bom no chat, mas não está centralizado como barramento único para todas as telas/módulos.
- Modelo atual é fortemente acoplado a WhatsApp e a `user_id` (tenant indireto), o que dificulta expansão multicanal.

---

## 2) Auditoria obrigatória — estrutura atual

## 2.1 Frontend

### Páginas e componentes principais

- `src/pages/Chat.tsx`
  - Lista de conversas, thread, seleção de instância, sync manual por conversa, envio de mensagem, WebSocket.
- `src/pages/ChatKanbanPage.tsx`
  - Visão Kanban de conversas com realtime específico.
- `src/components/chat/ChatContactProfileSheet.tsx`
  - Perfil lateral (CRM + dados da conversa).
- `src/components/chat/ChatBubbleContent.tsx`
  - Render da bolha/mídia.
- `src/components/chat/MessageStatusIndicator.tsx`
  - Status de entrega/leitura.
- `src/components/whatsapp/InstancesList.tsx`
  - Lista de instâncias no Settings.
- `src/components/whatsapp/WhatsAppInstanceCard.tsx`
  - Card compacto da instância.
- `src/components/whatsapp/WhatsAppInstanceDetailsSheet.tsx`
  - Drawer de detalhe da instância.
- `src/lib/whatsappInstanceProfile.ts`
  - Regra de nome/foto/telefone da instância.
- `src/utils/chatIdentityDisplay.ts`
  - Regra de nome/foto de conversa com prioridade CRM.

### Onde nome/foto são resolvidos

- Conversa (lista/chat): `resolveConversationIdentity()` em `src/utils/chatIdentityDisplay.ts`.
  - Nome: CRM (cliente/lead) > `displayName/contactName/profileName` > telefone > `external_chat_id`.
  - Foto: CRM (`avatar_url/photo`) > WhatsApp (`avatarUrl`/metadata) > iniciais.
- Instância WhatsApp: `getWhatsAppInstanceProfileInfo()` em `src/lib/whatsappInstanceProfile.ts`.
  - Lê metadata e payloads persistidos (`connectedProfileName`, `lastConnect`, `lastStatusCheck`, etc.).

### Botão sincronizar

- Instância: `InstancesList` chama `chatService.syncConversations(...)`.
- Conversa aberta: `Chat.tsx` chama `syncConversationMessages(..., force: true, syncMode: 'full')` + refresh identity.
- Perfil lateral também expõe sync (`ChatContactProfileSheet`).

### Realtime atual

- Chat usa Socket.IO em `Chat.tsx` (`new_message`, `conversation_updated`, `message_updated`, etc.).
- Kanban usa hook específico `useKanbanAttendanceSocketRefresh`.
- SSE não identificado.
- Polling contínuo geral não é estratégia principal (há refresh manual e alguns polls pontuais no settings de instância).

---

## 2.2 Backend

### Rotas de chat/instância

- `packages/backend/src/routes/chatRoutes.ts`
  - Instâncias: listar, criar, conectar, status, patch, delete, webhook config.
  - Conversas: sync/list/profile/messages/sync-history/refresh-identity/link/unlink.
  - Atendimento: attend/transfer/attendance history.
  - Mensagens: send/mark-read.

### Webhook Uazapi

- `packages/backend/src/routes/uazapiWebhookRoutes.ts`
- `packages/backend/src/controllers/chatController.ts`
  - `handleWebhook` e `processWebhookEvent`.

### Serviços/Controllers correlatos

- `packages/backend/src/controllers/chatController.ts` (núcleo principal).
- `packages/backend/src/controllers/chatAttendanceController.ts`.
- `packages/backend/src/services/uazapi.ts` (API provider).
- `packages/backend/src/services/websocketService.ts` (realtime).
- `packages/backend/src/services/notifications.ts` (notificações internas).
- Utilitários de identidade:
  - `utils/uazapiIdentityResolve.ts`
  - `utils/canonicalConversationIdentity.ts`
  - `utils/chatIdentityQuality.ts`
  - `utils/uazapiChatIdentity.ts`

### Worker/cron de sync

- Não foi identificado um worker dedicado de sync histórico contínuo de chat.
- Sync ocorre por:
  - ação manual (endpoints de sync),
  - fluxo de connect/status,
  - webhook em tempo real.
- Existem workers para outros domínios (billing/notifications/etc.), mas não um job recorrente robusto de backfill completo de chat.

---

## 2.3 Banco de dados (estado atual)

## Tabelas centrais de chat

- `chat_instances`
  - Campos relevantes: `id`, `user_id`, `name`, `external_instance_name`, `status`, `metadata`, `connected_phone`, `phone_key`.
  - Tenant: indireto via `users.tenant_id` (não possui `tenant_id` próprio).
- `chat_conversations`
  - Campos: `instance_id`, `external_chat_id`, `contact_name`, `profile_name`, `phone_number`, `display_name`, `avatar_url`,
    `canonical_chat_id`, `canonical_phone`, `identity_*`, `history_sync_status`, `client_id`, `lead_id`, `metadata`.
  - Relações: instância, cliente/lead, atendimento.
- `chat_messages`
  - Campos: `conversation_id`, `external_message_id`, `direction`, `body`, `media`, `status`, `sent_at`, `metadata`.
- `chat_conversation_assignment_history`
  - Auditoria de atribuição/atendimento.

## Outras tabelas correlatas

- `notifications` e estruturas de outbound notifications.
- `whatsapp_webhook_events` / `whatsapp_connections` (camada paralela legada).
- Estruturas de Kanban (`chat_kanban_*`).

## Observações de modelagem

- Núcleo de chat não possui `tenant_id` explícito (dependência de join com `users`).
- Forte acoplamento semântico ao WhatsApp (`external_chat_id`, JID) no core.
- Coexistência de estruturas antigas e novas de WhatsApp pode gerar dualidade de fonte de verdade.

---

## 3) Problemas solicitados — validação com evidência

## 3.1 Nome da instância (confirmado)

- Frontend mostrava fallback técnico quando `connectedProfileName` não era persistido.
- Backend tinha extração incompleta do nome humano em alguns payloads (`profileName/name` apenas).
- Evidência:
  - `chatController.ts` (extração em `connectInstance`/`getInstanceStatus`).
  - `whatsappInstanceProfile.ts` (fallback de nome no frontend).

## 3.2 Foto da instância (parcialmente confirmado)

- Uazapi pode retornar foto (`profilePicUrl` e aliases), mas nem sempre no mesmo formato.
- Persistência já existe em metadata (`connectedProfilePicUrl`), porém dependia de extração incompleta/heterogênea.
- UI já evita depender estritamente da API em tempo real, mas precisava de fallback mais amplo.

## 3.3 Foto do contato/cliente (confirmado com nuance)

- Conversa já persiste `avatar_url` e metadata de foto (`whatsapp_profile_photo`) com regras de proteção contra overwrite vazio.
- UI do chat já prioriza CRM (cliente/lead) > WhatsApp.
- Gap: não existe no modelo atual um caminho único e consistente para promover avatar de contato para cadastro CRM em todos os cenários (depende de estrutura dos cadastros e campos disponíveis por contexto).

## 3.4 Sincronização e histórico antigo (confirmado)

- Limites operacionais (`limit`, lotes, gating por identidade/cooldown) restringem backfill completo.
- Sync por conversa usa paginação/cursor da Uazapi, mas não há loop global agressivo para exaurir histórico de forma contínua.
- Consequência: conversas antigas podem ficar incompletas sem sync manual e/ou hidratação de identidade.

## 3.5 Realtime/notificações ao vivo (parcialmente confirmado)

- Webhook Uazapi chega e processa.
- Eventos geram atualização local e emitem socket.
- Chat atualiza em tempo real.
- Gap: faltam contratos/event-bus unificados para propagar consistentemente em todas as telas (chat, sininho global, dashboard/home, futuros canais).

---

## 4) Correções já implementadas nesta etapa (Fase 1 segura)

## 4.1 Backend — extração robusta de nome/telefone da instância

Arquivo: `packages/backend/src/controllers/chatController.ts`

- Adicionados helpers:
  - `extractConnectedProfileName(payload)`
  - `extractConnectedPhone(payload)`
- Agora varre campos:
  - `profile_name`, `profileName`, `push_name`, `pushName`, `contact_name`, `contactName`, `display_name`, `displayName`, `name`
  - em múltiplos níveis (`root`, `instance`, `data`, `data.instance`).
- Aplicado em:
  - `connectInstance`
  - `getInstanceStatus`
- Efeito: aumenta chance de persistir corretamente `metadata.connectedProfileName` e `metadata.connectedPhone`.

## 4.2 Frontend — fallback robusto de nome da instância

Arquivo: `src/lib/whatsappInstanceProfile.ts`

- `getWhatsAppInstanceProfileInfo()` atualizado para fallback amplo.
- Prioriza dados persistidos/humanos e só cai para técnico no final.
- Inclui leitura de `lastConnect` / `lastStatusCheck` e campos alternativos.

## 4.3 UI Settings > WhatsApp

- Lista compacta e escalável para múltiplas instâncias.
- Card com hierarquia humana, status e atividade.
- Nome técnico mantido como secundário (`Instância: ...`), nunca principal por padrão.

---

## 5) Arquitetura alvo — Chat Engine Multicanal

A proposta alvo segue as entidades de comunicação do requisito, com adaptação incremental para não quebrar legado:

- `communication_channels`
- `communication_channel_identities`
- `communication_contacts`
- `communication_conversations`
- `communication_messages`
- `communication_events`

## Estratégia recomendada de migração

- Não substituir tabelas atuais de uma vez.
- Introduzir camada `communication_*` em paralelo.
- Criar adaptadores de leitura/escrita:
  - legado `chat_*` <-> novo `communication_*`.
- Migrar endpoint por endpoint com feature flag.

---

## 6) Regras centrais de identidade e avatar (proposta operacional)

## Canal/instância (nome)

Prioridade:
1. `profile_name` / `push_name` / `display_name` do provider (persistidos),
2. `display_name` salvo,
3. telefone formatado,
4. `instance_name` técnico (fallback final).

## Canal/instância (foto)

Prioridade:
1. `profile_avatar_url` persistido,
2. logo do negócio/tenant,
3. iniciais.

Regra: nunca depender somente de chamada em tempo real para renderização.

## Contato/conversa (foto)

Prioridade UI:
1. avatar CRM (`customer`/`lead`),
2. avatar persistido de contato/canal,
3. avatar do provider persistido,
4. iniciais.

Regra de persistência:
- nunca apagar avatar existente quando provider não devolver novo valor válido;
- só atualizar quando houver substituto não vazio.

---

## 7) Sync em camadas (proposta)

## Sync leve

- Atualiza conversas recentes, unread, preview, status.

## Sync de perfil

- Atualiza perfil de instância e contatos (nome/foto) sem apagar dados válidos existentes.

## Sync histórico por conversa

- Cursor/paginação com estratégia de backfill.
- Pode rodar sob demanda ao abrir conversa e em job controlado.

## Sync manual (botão)

- Deve executar:
  - refresh perfil instância,
  - refresh conversas recentes,
  - refresh identidades incompletas,
  - registrar resumo de resultado/log.

---

## 8) Webhook + Realtime + Notificações (proposta incremental)

## Backend

- Reaproveitar Socket.IO já existente.
- Normalizar eventos em estrutura de eventos (futura `communication_events`).
- Garantir idempotência por `provider_message_id` + tenant + provider.

## Eventos mínimos

- `message.created`
- `conversation.updated`
- `conversation.assigned`
- `notification.created`
- `channel.status_changed`

## Frontend

- Criar client realtime unificado (chat + notificações + dashboard).
- Reconnect automático.
- Fallback de polling quando socket degradar.

---

## 9) Endpoints atuais vs alvo

## Atuais (já em produção)

- `/api/chat/instances*`
- `/api/chat/conversations*`
- `/api/chat/messages`
- `/webhooks/uazapi/*`
- Socket.IO `/socket.io`

## Alvo (camada nova)

- `/api/communication/channels*`
- `/api/communication/conversations*`
- `/api/realtime/events` (ou socket namespace consolidado)

Recomendação: manter compatibilidade por versão/alias durante migração.

---

## 10) Riscos e mitigação

- **Risco de regressão no chat atual**  
  Mitigar com feature flags, rollout gradual e métricas de erro.
- **Duplicidade de modelos (`chat_*` e `communication_*`)**  
  Mitigar com adaptadores bem definidos e plano de depreciação.
- **Drift de schema/tipos**  
  Atualizar tipos e contratos automaticamente após migrations.
- **Carga de sync histórico**  
  Limites, cursor persistente e execução em janelas.

---

## 11) Plano faseado de implementação

## Fase 1 (concluída nesta entrega — segura)

- Corrigir nome/foto da instância WhatsApp com extração e fallback robustos.
- Garantir que nome técnico seja fallback secundário.
- Ajustar UI Settings para leitura humana.

## Fase 2 (próxima — segura com escopo controlado)

- Centralizar regra de nome/foto de contato em um resolver único backend/frontend.
- Persistir identidade de contato de forma consistente (sem apagar avatar válido).
- Reforçar uso de avatar CRM quando vínculo existe.
- Opcional: criar tabela de cache de contato multicanal para desacoplar de `chat_conversations`.

## Fase 3 (incremental)

- Realtime unificado (chat + notificações + dashboard) sobre socket existente.
- Contrato único de eventos por tenant.
- Instrumentação de reconnect/fallback e telemetria.

## Fase 4 (multicanal)

- Introdução de `communication_*` em paralelo.
- Adaptadores por provider (WhatsApp primeiro, depois Instagram/Facebook).
- Migração gradual de endpoints.

---

## 12) Critérios de aceite — status atual

## Investigação (atendido)

- Campo/fonte do nome real da instância identificado.
- Pontos de perda de foto/nome mapeados.
- Causa de lacunas em conversas antigas mapeada (limites/gates/paginação/identidade).
- Plano multicanal e realtime definido.
- Sem ruptura de fluxo atual.

## Implementação inicial (atendido parcialmente nesta etapa)

- Instância mostra nome real com fallback robusto.
- Avatar/nome da instância persistidos quando payload fornece.
- UI prioriza avatar CRM quando disponível (já existente e mantido).
- Não apagar avatar por retorno vazio (regras já existentes reforçadas no plano).
- Build frontend validado.

Pendente para próxima execução:

- Formalizar persistência cross-entity de avatar de contato para CRM quando houver campo-alvo consistente e seguro em todos os cadastros.
- Unificar barramento realtime para módulos além do chat.

---

## 13) Atualização incremental — Fase 2 (communication_contacts)

Implementado sem quebra do modelo atual:

- Tabela nova: `communication_contacts` (ponte técnica provider/canal <-> CRM).
- Não cria cliente/lead novo; apenas vincula por `linked_client_id` / `linked_lead_id`.
- Escopo tenant obrigatório (`tenant_id`) com RLS tenant-scoped.
- Unicidade parcial:
  - `(tenant_id, provider, phone)` quando `phone` não nulo;
  - `(tenant_id, provider, provider_contact_id)` quando `provider_contact_id` não nulo.

Arquivos aplicados:

- `database/init/175_communication_contacts.sql`
- `supabase/migrations/20260428135000_communication_contacts.sql`
- `packages/backend/src/services/communicationContactService.ts`
- `packages/backend/src/controllers/chatController.ts`
- `packages/backend/src/migrate.ts`

### Função da camada

`communication_contacts` atua como identidade técnica multicanal persistida para:

- manter `display_name` e `profile_avatar_url` do contato externo;
- registrar `provider_contact_id`/telefone canônico;
- vincular com CRM (cliente/lead) sem duplicar cadastro;
- preservar avatar existente quando o provider não retorna novo valor.

### Regras operacionais aplicadas

- Upsert por provider + (`provider_contact_id` ou `phone`) no mesmo tenant.
- Atualização de avatar:
  - se vier URL válida: atualiza;
  - se vier vazio/nulo: mantém valor atual (não apaga).
- Vinculação CRM:
  - quando conversa já possui `client_id`/`lead_id`, grava na ponte técnica.

### Prioridade de nome/avatar (mantida)

Nome:
1. `client.name` / `lead.name`
2. `communication_contacts.display_name`
3. nome do provider/conversa
4. telefone

Avatar:
1. `clients.whatsapp_avatar_url` / `leads.whatsapp_avatar_url` (CRM)
2. `communication_contacts.profile_avatar_url`
3. avatar provider persistido em conversa (`chat_conversations.avatar_url` / metadata)
4. iniciais

## 14) Fase 3 — realtime base (implementação incremental)

Implementado sem quebra do fallback atual (refresh/polling continua funcional):

- **Backend realtime core**
  - Serviço novo: `packages/backend/src/services/realtimeService.ts`
  - Funções: `emitToTenant`, `emitToUser`, `getTenantRoom`, `registerSocketHandlers`
  - Room padrão tenant: `tenant:{tenantId}`
- **Segurança tenant-scoped**
  - Socket continua autenticado por JWT.
  - Conexões entram em `user:{userId}` e `tenant:{tenantId}`.
  - Sem entrada manual em tenant externo.
- **Eventos padronizados**
  - `message.created`
  - `conversation.updated`
  - `notification.created`
  - `channel.status_changed`
  - Compatibilidade mantida com eventos legados (`new_message`, `conversation_updated`, etc.).
- **Idempotência por provider_message_id (equivalente atual)**
  - Persistência usa chave única existente `UNIQUE(conversation_id, external_message_id)`.
  - `saveMessage(...)` agora distingue inserção real vs conflito (`inserted`).
  - Em duplicata:
    - não re-emite `message.created`/`new_message`;
    - registra `realtime_duplicate_message_skipped`.
- **Integração webhook Uazapi**
  - Fluxo mantém normalização + upsert de contato/conversa.
  - Em mensagem nova:
    - salva com idempotência;
    - emite `conversation.updated` tenant-scoped;
    - emite `message.created` apenas quando não duplicada.
  - Em mudança de conexão:
    - emite `channel.status_changed`.
- **Notificações (sininho)**
  - Ao criar notificação interna, backend emite `notification.created` para tenant.
  - Frontend escuta e atualiza badges/lista sem depender só de polling.
- **Frontend realtime**
  - Cliente global: `src/services/realtimeClient.ts`
  - Hook de bootstrap: `src/hooks/useRealtimeEvents.ts` (montado no `AppLayout`)
  - Chat escuta também os eventos novos (`message.created`, `conversation.updated`) sem remover os legados.
  - Settings/WhatsApp reage a `channel.status_changed` para atualizar cards.

### Fase 3.1 — estratégia de transição (novo vs legado)

- **Prioridade dos eventos novos no Chat**
  - `message.created`
  - `conversation.updated`
- **Fallback legado temporário**
  - `new_message`
  - `conversation_updated`
- **Feature flags de transição (frontend)**
  - `VITE_CHAT_REALTIME_V2` (default: `1`)  
    - `1/true`: prioriza eventos novos.
    - `0/false`: opera no modo legado.
  - `VITE_CHAT_REALTIME_LEGACY_FALLBACK` (default dinâmico)  
    - quando `V2=1`, default é `0` para evitar duplicidade;
    - pode ser `1` temporariamente para rollback suave.
- **Compatibilidade mantida**
  - `message_updated` legado permanece ativo (ainda sem equivalente novo consolidado para status granular).
  - polling/refresh continua disponível como rede de segurança.

### Observabilidade do realtime no Chat (sem UI)

Objetivo em produção: saber por sessão se o fluxo **V2** (`message.created` / `conversation.updated`) está a chegar, se o **fallback legado** está ativo e a receber eventos, e se o **socket** está ligado ou desligado — sem qualquer elemento visual para o utilizador final.

- **Implementação:** `src/lib/chatRealtimeDiagnostics.ts`
- **Ativação**
  - **Desenvolvimento:** os eventos abaixo são emitidos para a consola (com throttle por tipo de evento para evitar spam).
  - **Produção:** os mesmos nomes só aparecem quando `VITE_CHAT_REALTIME_DEBUG=1` (ou `true`).
- **Eventos (primeiro argumento do `console.info`, filtrável no DevTools)**
  - `chat_realtime_v2_event_received` — payload inclui `kind`: `conversation` | `message` e ids relevantes.
  - `chat_realtime_legacy_event_received` — idem para o barramento legado.
  - `chat_realtime_socket_connected` — inclui `realtime_v2_preferred`, `legacy_fallback_enabled`, `socket_id`, `transport`.
  - `chat_realtime_socket_disconnected` — inclui `reason` e as mesmas flags de modo.
  - `chat_realtime_duplicate_skipped` — dedupe no cliente ao juntar mensagem na thread (ex.: V2 + legado em paralelo); inclui `reason` (`id` | `external_message_id`), `source` (`v2` | `legacy`).
- **Interpretação rápida**
  - Só **V2** + socket ligado: rollout saudável com fallback desligado.
  - **Legacy** a aparecer com `V2=1` e `legacy_fallback_enabled=true`: rollback parcial explícito; comparar com duplicados ignorados.
  - Rajadas de `duplicate_skipped` com `source` alternado: ambos os barramentos a entregar a mesma mensagem (esperado com fallback ligado).

---

## Fase 4 — preparação multicanal

Objetivo: permitir **outros canais** (Instagram, Messenger, webchat, e-mail) sem integrações reais nesta fase, mantendo **WhatsApp/Uazapi** estável e **rotas/tabelas** atuais.

### Fase 4.0 — Auditoria de acoplamento (onde ainda há WhatsApp/Uazapi)

| Área | Ficheiros / pontos | Acoplamento | Alterado nesta fase | Fases futuras |
|------|---------------------|-------------|---------------------|---------------|
| Webhook + pipeline | `packages/backend/src/controllers/chatController.ts` (`handleWebhook`, `processWebhookEvent`, `upsertConversation`, `saveMessage`) | Payload Uazapi, `normalizeChatPayload`, envio `uazapiService` | Entrada do webhook via `communicationEngineService.processProviderWebhook`; colunas `provider` / vínculo `communication_contact_id`; emits realtime com `provider` | Extrair normalização Uazapi para adapter; reduzir tamanho do controller |
| API provedor | `packages/backend/src/services/uazapi.ts` | HTTP Uazapi | Sem mudança | Abstrair `ChannelTransport` por provider |
| Identidade WA | `packages/backend/src/utils/uazapiChatIdentity.ts`, `canonicalConversationIdentity.ts`, `uazapiIdentityResolve.ts` | JID, `@lid`, foto/metadata Uaz | Reuso; join `communication_contacts` por `c.provider` | Regras por canal (username-first) |
| Instâncias | `chat_instances`, rotas em `chatRoutes.ts`, UI `src/components/whatsapp/*` | Nome “WhatsApp”, tokens Uaz | Sem renomear UI | Modelo “channel” genérico + credenciais por provider |
| Lista conversas | `getConversations` (controller), `conversationRowForClientApi` | LATERAL só WA | `c.provider` na query; join contact por `COALESCE(c.provider, 'whatsapp_uazapi')` | Filtro UI por canal |
| Realtime | `emitToTenant` em controller | Eventos sem `provider` | `message.created`, `conversation.updated`, `channel.status_changed` incluem `provider` | Consumidores multicanal no Kanban/outros |
| Frontend Chat | `src/pages/Chat.tsx`, `src/services/chat.ts` | Textos e fluxos WA | Tipos `CommunicationProvider`; badge de canal para `provider !== whatsapp_uazapi` | Ícones por canal, inbox unificado |
| Contactos multicanal | `communication_contacts`, `communicationContactService.ts` | Índices phone + `provider_contact_id` | Lookup por **username** (índice único parcial); prioridade documentada | Sincronização Instagram/Graph |

**O que não foi implementado nesta fase:** OAuth Meta, webhooks Instagram/Messenger, adapter concreto para `instagram` / `facebook_messenger`, renomear menu Settings para “Canais”, migração de `chat_instances` para tabela genérica de canais.

### Providers padronizados (backend)

- Ficheiro: `packages/backend/src/services/communication/communicationTypes.ts`
- `CommunicationProvider`: `whatsapp_uazapi` | `instagram` | `facebook_messenger` | `webchat` | `email`
- Direções, tipos de mensagem e estado de conversa alinhados ao modelo normalizado (mapeamento BD: `incoming`/`outgoing` ↔ `inbound`/`outbound` nos tipos canónicos).

### Modelos normalizados

- `packages/backend/src/services/communication/normalizedCommunication.ts`
- `NormalizedCommunicationContact`, `NormalizedCommunicationConversation`, `NormalizedCommunicationMessage` — linguagem interna do engine; `provider_message_id` no modelo canónico corresponde a `chat_messages.external_message_id` (sem coluna duplicada).

### Adapter e orquestração

- Interface: `communicationProviderAdapter.ts` (`CommunicationProviderAdapter`)
- Implementação inicial: `whatsappUazapiAdapter.ts` (normalização leve + delegação de envio/sync ao controller documentada)
- Orquestração: `communicationEngineService.ts` — `processProviderWebhook`, `resolveProviderAdapter`, `sendProviderMessage`, `refreshProviderProfile`, `syncProviderConversations` (extensível; sync/send WA continuam no HTTP legado até registo de delegates)
- Webhook: `handleWebhook` chama `processProviderWebhook('whatsapp_uazapi', …)` que delega no `processWebhookEvent` registado.

### Realtime multicanal (Fase 3 + 4)

Payloads tenant-scoped passam a incluir **`provider`** (default `whatsapp_uazapi`):

- `message.created`: `provider`, `conversation_id`, `message_id`, `provider_message_id`, `direction`, `message_type`, `body`, `media_url`, `sent_at`
- `conversation.updated`: `provider`, `conversation_id`, `display_name`, `avatar_url`, `last_message_preview`, `last_message_at`, `unread_count`, …
- `channel.status_changed`: `provider`, `channel_id`, `status`, …

Helpers: `packages/backend/src/services/communication/realtimePayloads.ts`.

### Base de dados (compatível, não destrutivo)

- Ficheiro: `database/init/182_chat_engine_multichannel_phase4.sql` (+ espelho em `supabase/migrations/`)
- `chat_conversations`: `provider` (default `whatsapp_uazapi`), `provider_conversation_id` (backfill a partir de `external_chat_id` para WA), `communication_contact_id` (FK opcional)
- `chat_messages`: `provider` (default `whatsapp_uazapi`); ID da mensagem no provedor continua em `external_message_id`
- `communication_contacts`: índice único parcial `(tenant_id, provider, username)` onde `username` não vazio

### Identidade multicanal (contacto)

Ordem de resolução em `upsertCommunicationContactFromProvider` (mesmo tenant + provider):

1. `provider_contact_id`
2. `phone` (normalizado)
3. `username`

Para WhatsApp, **telefone** e **provider_contact_id** (JID/chat id) continuam fortes; para Instagram/Facebook futuros, **username** / **provider_contact_id** ganham peso.

### Frontend

- `src/types/communication.ts` — tipos alinhados ao backend
- `src/lib/communicationChannelUi.ts` — rótulos para badge (só exibido quando `provider !== whatsapp_uazapi`)
- `ChatConversation.provider` em `src/services/chat.ts` + normalização da API

### Estratégia de migração futura

1. Introduzir adapters por provider e mover `processWebhookEvent` por fatias para o engine.
2. Generalizar `chat_instances` (ou tabela `communication_channels`) com `provider` + credenciais JSON.
3. UI “Canais de atendimento” mantendo atalho WhatsApp.
4. Inbox com filtro por `provider` e ícones.

---

## Fase 5 — Atendimento profissional

**Objetivo:** central de atendimento com filas, equipes (reutiliza `teams` / `team_members`, papel `supervisor` adicionado), responsável, **status** normalizados, transferências com histórico, métricas básicas, notificações e visibilidade por permissões.

### Estado (`attendance_status` na BD)

Valores: `open`, `pending`, `in_progress`, `waiting_customer`, `closed`, `archived`. Migração a partir de legado (`unassigned`/`queued`/`in_service` → novos).

### Migração

- `database/init/185_chat_engine_phase5_professional.sql` (+ espelho Supabase)
- Tabelas: `chat_queues`, `chat_conversation_transfers`; colunas SLA em `chat_conversations` (`first_response_at`, `last_customer_message_at`, `last_agent_message_at`, `priority`, `closed_by`, …).

### API (prefixo `/api/chat`)

- Filas: `GET/POST /queues`, `PATCH /queues/:id`
- Métricas: `GET /metrics`
- Transferências (histórico): `GET /conversations/:id/transfers`
- Atribuir / transferir / estado / fila / equipa: `PATCH …/assign`, `…/transfer`, `…/status`, `…/queue`, `…/team` (aliases sobre `patchConversationAttendance`)
- Equipas (delegação das rotas CRM): `GET/POST /teams`, `PATCH /teams/:id`, membros `…/teams/:teamId/members`

### Permissões (`module_extras` do módulo `chat`)

Ver `packages/backend/src/services/chatAccess.ts`: `chat_view_all`, `chat_reply`, `chat_assign`, `chat_transfer`, `chat_close`, `chat_manage_queues`, `chat_manage_teams` (predefinições conservadoras para não quebrar instalações existentes).

### Documentação detalhada

Ver `docs/CHAT_ATENDIMENTO_PROFISSIONAL.md`.

