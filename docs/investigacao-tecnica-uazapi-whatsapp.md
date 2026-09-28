# Investigacao Tecnica - Integracao WhatsApp (UazAPI/Uazap)

Data: 2026-04-07  
Escopo: investigacao completa de fluxo atual (backend, frontend, banco), sem implementacao de correcao.

---

## 1) Resumo executivo

O problema principal nao esta em um unico ponto; e um efeito combinado de:

- **sincronizacao dependente de acao manual no frontend** (clique no card/acao de sync);
- **ausencia de job de fallback** para sincronizacao quando webhook falha;
- **envio focado em texto**, sem cobertura clara de envio de midia no fluxo principal;
- **inconsistencias de reflexo em tempo real** por formato de evento/socket e atualizacao local;
- **stack mista** (`chat_*` atual + `whatsapp_*` legado), que aumenta risco de comportamento divergente.

Prioridade de correcao recomendada:

1. sincronizacao automatica ao conectar (conversas + mensagens);
2. envio/recebimento correto de texto e midia;
3. robustez webhook + websocket para mensagens enviadas;
4. configuracao de sincronizacao por periodo na conexao;
5. preparacao estrutural para fila/atendimento multiusuario.

---

## 2) Fluxo atual real da integracao UazAPI

## Backend (visao ponta a ponta)

### Conexao e instancia

- Rotas em `packages/backend/src/routes/chatRoutes.ts`:
  - `POST /api/chat/instances`
  - `POST /api/chat/instances/:id/connect`
  - `GET /api/chat/instances/:id/status`
  - `POST /api/chat/instances/:id/webhook`
  - `POST /api/chat/instances/:id/webhook/force`
  - `GET /api/chat/instances/:id/webhook`
- Controller: `packages/backend/src/controllers/chatController.ts`
- Integracao provider: `packages/backend/src/services/uazapi.ts`

### Sincronizacao

- Conversas: `POST /api/chat/conversations/sync` -> `syncConversations`
- Mensagens por conversa: `POST /api/chat/conversations/:id/messages/sync` -> `syncConversationMessages`
- Identidade/foto: `POST /api/chat/conversations/:id/refresh-identity` -> `refreshConversationIdentity`

### Webhook

- Rota: `packages/backend/src/routes/uazapiWebhookRoutes.ts` (`POST /webhooks/uazapi/*`)
- Controller: `handleWebhook` e `processWebhookEvent` em `chatController.ts`
- Persistencia de eventos em:
  - conversa (`upsertConversation`)
  - mensagem (`saveMessage`)
  - notificacoes/socket

### Websocket

- Inicializacao: `packages/backend/src/index.ts`
- Emissao: `packages/backend/src/services/websocketService.ts`
  - `emitConversationUpdate`
  - `emitNewMessage`
  - `emitNotification`
  - `emitUnreadCount`

## Frontend (visao ponta a ponta)

- Pagina principal de chat: `src/pages/Chat.tsx`
- Configuracao/conexoes:
  - `src/components/settings/WhatsAppSection.tsx`
  - `src/components/whatsapp/InstancesList.tsx`
  - `src/components/whatsapp/AddConnectionDialog.tsx`
  - `src/components/whatsapp/QRCodePopup.tsx`
  - `src/components/whatsapp/InstanceDetailsDialog.tsx`
- Service de API chat: `src/services/chat.ts`

---

## 3) Como a conexao da instancia funciona hoje

Fluxo observado:

1. usuario cria instancia (`/api/chat/instances`);
2. usuario conecta/gera QR (`/api/chat/instances/:id/connect`);
3. frontend faz polling de status (`/status`) no popup;
4. webhook pode ser configurado automatico (`autoConfigureWebhook`) em modo best-effort;
5. ao conectar, nao ha garantia de sync completo automatico de historico (depende de chamadas de sync e/ou webhook).

Ponto fragil:

- se webhook nao estiver funcional (URL/token/eventos), o sistema pode aparentar conectado mas sem entrada de eventos historicos/reais.

---

## 4) Como a sincronizacao funciona hoje

Hoje ha 3 mecanismos:

- **sync manual de conversas** (`/api/chat/conversations/sync`);
- **sync manual de mensagens por conversa** (`/api/chat/conversations/:id/messages/sync`);
- **webhook em tempo real** para novos eventos.

Nao foi encontrado job recorrente oficial de fallback que faca pull periodico para fechar lacunas de webhook.

---

## 5) Por que a sincronizacao depende do clique no card

Causa principal no frontend:

- No card da instancia (`InstancesList`), ao abrir `InstanceDetailsDialog`, o componente executa:
  1. `syncConversations(instance.id)`
  2. `getConversations(...)`
  3. `syncAllConversationMessages(...)`

Ou seja, **o clique no card dispara explicitamente o fluxo de sync** que nao roda de forma equivalente em toda conexao inicial.

No chat principal (`Chat.tsx`), tambem existem chamadas de sync ao selecionar conversa e em acoes manuais.

---

## 6) Diagnostico de mensagens de texto/imagem

## Texto

- Envio principal: `POST /api/chat/messages` (`chatService.sendMessage`).
- Persistencia local + emissao websocket existem.
- Gargalos possiveis:
  - resposta do provider sem `external_message_id` (reflexo/conciliacao parcial);
  - instancia errada em fluxos alternativos de envio (selecao por "primeira conectada" em caminhos legados).

## Imagem/midia

- No fluxo principal do chat, **nao ha envio completo de midia equivalente ao texto**.
- Exibicao no frontend principal (`Chat.tsx`) e majoritariamente textual (`body`), com fallback de "(mensagem sem texto)".
- Resultado pratico: midia pode ate existir no payload/metadata, mas nao aparecer corretamente na UI de conversa.

Conclusao:

- Para texto: problema tende a ser mais de conciliacao/reflexo/ack.
- Para imagem: ha gap funcional de envio e renderizacao no fluxo principal.

---

## 7) Diagnostico de mensagens enviadas (nao chegam / nao refletem)

Hipoteses tecnicas mais fortes, em ordem:

1. envio aceito localmente, mas sem confirmacao confiavel de status final (ack);
2. webhook com falha de configuracao ou mapeamento de instancia;
3. evento socket recebido em formato divergente entre telas;
4. mensagem persiste, mas nao aparece por regra de renderizacao/listagem;
5. mensagem aparece localmente, mas nao entrega no WhatsApp por erro de formato/numero/provider.

Sinal de arquitetura:

- sem pipeline robusto de reconciliacao assincroma (outbox + confirmacao por webhook), o estado "enviado" pode divergir da entrega real.

---

## 8) Mapa dos arquivos envolvidos

## Backend

- `packages/backend/src/routes/chatRoutes.ts`
- `packages/backend/src/routes/uazapiWebhookRoutes.ts`
- `packages/backend/src/controllers/chatController.ts`
- `packages/backend/src/services/uazapi.ts`
- `packages/backend/src/services/websocketService.ts`
- `packages/backend/src/services/notifications.ts`
- `packages/backend/src/services/messageService.ts` (fluxos paralelos de envio)
- `packages/backend/src/controllers/messagesController.ts`
- `packages/backend/src/utils/uazapiChatIdentity.ts`
- `packages/backend/src/services/conversationMatchingService.ts`
- `packages/backend/src/middleware/auth.ts`
- `packages/backend/src/index.ts`

## Frontend

- `src/pages/Chat.tsx`
- `src/components/whatsapp/InstancesList.tsx`
- `src/components/whatsapp/InstanceDetailsDialog.tsx`
- `src/components/whatsapp/AddConnectionDialog.tsx`
- `src/components/whatsapp/QRCodePopup.tsx`
- `src/components/settings/WhatsAppSection.tsx`
- `src/services/chat.ts`
- `src/pages/ClientProfile.tsx`

## Banco/migracoes

- `database/init/10_create_whatsapp.sql`
- `database/init/15_create_chat_tables.sql`
- `database/init/17_alter_chat_conversations_add_lead_id.sql`
- `database/init/18_add_chat_conversations_unique_constraint.sql`
- `database/init/19_add_connected_phone_to_instances.sql`
- `database/init/26_tenants_and_user_tenant.sql`
- `database/init/57_rls_tenant_isolation.sql`
- `database/init/85_chat_conversations_link_hardening.sql`
- `database/init/88_chat_instances_external_name_index.sql`
- `supabase/migrations/20250520000000_create_webhook_events_table.sql`

---

## 9) Mapa das tabelas/modelos envolvidos

## Nucleo chat

- `chat_instances`  
  (`user_id`, `external_instance_name`, `status`, `connected_phone`, `phone_key`, `metadata`...)
- `chat_conversations`  
  (`user_id`, `instance_id`, `external_chat_id`, `contact_name`, `phone_number`, `last_message_*`, `unread_count`, `metadata`, `client_id`, `lead_id`...)
- `chat_messages`  
  (`conversation_id`, `direction`, `external_message_id`, `body`, `media`, `status`, `metadata`...)

## Legado/atendimento antigo

- `whatsapp_connections`
- `conversation_attendances` (`status`, `attendant_id`, `remote_jid`, etc.)

## Tenant e isolamento

- `users.tenant_id`
- `tenants` (limites/plano/estado)
- RLS tenant em `chat_*` via `57_rls_tenant_isolation.sql`

Observacao importante:

- nao existe tabela dedicada `chat_contacts`; contato esta distribuido entre `chat_conversations` e entidades CRM (`clients`/`leads`).

---

## 10) Riscos de regressao

1. alterar fluxo de sync sem considerar webhook pode duplicar mensagens/conversas;
2. mexer em matching de contato pode vincular conversa no cliente/lead errado;
3. mudar chave de identificacao da instancia pode quebrar roteamento de webhook;
4. stack mista (`chat_*` + `whatsapp_*`) pode causar comportamento paralelo e confuso;
5. ajustes sem reforco de tenant-scope podem abrir vazamento entre tenants;
6. alterar formato de evento websocket sem compatibilidade quebra atualizacao em telas diferentes.

---

## 11) Plano de implementacao por etapas (proposto)

## Etapa 0 - Hardening de observabilidade (rapido)

- padronizar logs com `tenant_id`, `instance_id`, `conversation_id`, `external_message_id`, `event_type`;
- registrar resultado de auto-webhook (ok/falha/erro de auth);
- criar metricas basicas: webhook recebido, sync iniciado, sync concluido, erro por etapa.

## Etapa 1 - Sincronizacao automatica ao conectar (prioridade 1)

- ao confirmar conexao da instancia:
  - disparar job assincromo de bootstrap sync (conversas + mensagens por janela);
  - manter idempotencia por `instance_id` + `run_id`;
  - marcar estado de sync (queued/running/completed/failed) para UI.
- manter clique manual como fallback/forcar sync.

## Etapa 2 - Texto e midia (prioridade 2)

- unificar contrato de mensagem (texto/midia/caption/mime/url/base64 onde aplicavel);
- implementar envio de midia no backend/service provider;
- padronizar persistencia `chat_messages.media` e renderizacao no frontend.

## Etapa 3 - Enviadas/ack/webhook/websocket (prioridade 3)

- formalizar estados: `queued`, `provider_sent`, `delivered`, `read`, `failed`;
- reconciliar por webhook e atualizar socket de forma consistente;
- padronizar payload websocket entre `Chat` e `ClientProfile`.

## Etapa 4 - Configuracao de sync na conexao (prioridade 4)

- na criacao/conexao da instancia, incluir:
  - `sync_mode`: `none | days_7 | days_30 | days_90 | full`
  - `sync_on_connect`: boolean
- persistir em configuracao da instancia (metadata/config dedicado);
- usar esse valor para parametrizar job bootstrap e sync manual.

## Etapa 5 - Preparacao para fila/multiusuarios (prioridade 5)

- introduzir modelo explicito de atendimento em `chat_conversations`:
  - `attendance_status` (`unassigned|queued|in_service|closed`)
  - `assigned_to_user_id`
  - `queue_id`
  - timestamps de atribuicao
- criar tabela de historico de atribuicao/status;
- websocket com eventos de mudanca de atribuicao/fila;
- UI com botao **Atender** e filtros por fila/atribuicao.

---

## 12) O que corrigir primeiro

1. **sync automatica ao conectar** com estado visivel de progresso;
2. **fallback de sync** (manual + job) para resiliencia a falha de webhook;
3. **padronizacao de payload de mensagem** (texto/midia) no backend e front;
4. **ack/conciliacao** de mensagens enviadas por webhook;
5. **parametro de periodo de sync** na conexao.

---

## 13) Preparacao agora para futura fila/multiusuarios (sem retrabalho)

Para evitar retrabalho, o que deve nascer ja na proxima fase:

- contrato de conversa com estado de atendimento explicito;
- separacao clara entre:
  - conversa nao atribuida,
  - em fila,
  - em atendimento,
  - atribuida a usuario;
- tenant-scope explicito em toda consulta/emit websocket;
- padrao unico de evento real-time (tipo + payload versionado);
- log/auditoria de atribuicao para rastreabilidade operacional.

---

## Respostas objetivas as perguntas da investigacao

1. **Por que a sync nao roda automatica ao conectar?**  
   Porque o principal gatilho atual de sync completa esta no frontend (abertura/click de card e acoes manuais), sem job de bootstrap garantido apos conexao.

2. **O que sincroniza hoje?**  
   Conversas, mensagens por conversa e identidade/foto via endpoints de sync; tempo real via webhook quando configurado/saudavel.

3. **Por que clique no card dispara algo que conexao inicial nao dispara?**  
   `InstanceDetailsDialog` executa cadeia explicita de sync ao abrir.

4. **Onde esta gargalo de midia/texto?**  
   Midia: lacuna de envio/renderizacao no fluxo principal.  
   Texto: gargalo de conciliacao/ack/reflexo.

5. **Onde esta gargalo de mensagens enviadas?**  
   Combinacao de persistencia local, webhook de confirmacao e broadcast websocket com possiveis divergencias de formato/estado.

6. **Problema principal e webhook, websocket, persistencia ou UI?**  
   Principalmente combinacao de **orquestracao de sync + webhook**; UI e websocket amplificam o sintoma quando payload/estado divergem.

7. **Melhor ponto para configurar sync por periodo?**  
   Na criacao/conexao da instancia (config persistida na instancia) + execucao em job de bootstrap.

8. **Como preparar para fila/Atender sem retrabalho?**  
   Definir desde ja modelo de atribuicao/estado em conversa + eventos websocket + auditoria, mantendo isolamento multi-tenant.

