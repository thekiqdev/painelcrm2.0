# AUDIT — WhatsApp Recurring Invoice Notification

| Campo | Valor |
|-------|-------|
| **Nome** | `AUDIT_WHATSAPP_RECURRING_INVOICE_NOTIFICATION` |
| **Versão** | 1.0 |
| **Tipo** | investigation_only |
| **Prioridade** | critical |
| **Data** | 2026-07-08 |
| **Regras** | Sem fix, sem alteração de DB/código/config/workers |

---

## 1. Veredicto executivo

| Critério de sucesso | Conclusão |
|---------------------|-----------|
| Por que o banco marca `disconnected`? | Principalmente **self-heal** após falha UazAPI 401/403/`Invalid token` no **envio** (`dispatchWhatsAppText`) ou no **poll** (`getInstanceStatus`); secundariamente webhook `connection` com `close`/`disconnected` **sem revalidar** a UazAPI. |
| Por que o automático usa “token inválido”? | O automático **usa o mesmo** `chat_instances.instance_token` e o mesmo filtro `status='connected'`. O erro **não é gerado pelo motor de billing** — vem da **resposta HTTP da UazAPI** (`uazapi.ts` monta `Error(payload.error\|\|…)`). Depois o self-heal grava `disconnected` e o classifier trata como **definitive** (sem retry útil). |
| Por que o manual funciona e o automático não? | **Não são pipelines de token diferentes.** O manual (`Reenviar notificação`) normalmente corre **depois** de o utilizador abrir Configurações/WhatsApp (ou atualizar status), o que chama `getInstanceStatus` e **reconcilia** o espelho do banco. O automático corre no worker **sem** sync com o provider — se o espelho está errado ou a UazAPI rejeita o token naquele instante, falha e “mata” o status. |

**Fonte da verdade hoje:** o espelho `chat_instances.status` no Postgres é tratado como verdade no envio; a **verdade real da sessão** é a UazAPI, mas só é consultada em refresh manual/UI (e parcial no webhook).

---

## 2. Comportamento observado (input)

| Comportamento | Status reportado |
|---------------|------------------|
| Envio manual na fatura | Funciona |
| Notificação automática (recorrência) | Falha com “Token inválido” |
| Status UI vs API | Banco `disconnected`; ao abrir/atualizar WhatsApp volta a conectado |

---

## 3. Mapa — fluxo MANUAL

```
Usuário → CustomerInvoiceDetail.handleReplayNotification
       → POST /api/customer-invoices/:id/replay-notification
       → customerInvoicesController.replayCustomerInvoiceNotificationHandler
       → replayInvoiceCreatedOutbound
       → publishInvoiceCreatedNotification (idempotency: invoice.created:{id}:manual:{uuid})
       → gateAndPublish
       → resolveWhatsAppSenderUserIdForTenant  (status = 'connected')
       → runTransactionalNotification
       → dispatchWhatsAppText
            SELECT instance_token FROM chat_instances
            WHERE user_id = $sender AND status = 'connected' LIMIT 1
       → uazapiService.sendTextMessage(token, …)
       → UazAPI /send/text
```

**Evidência:**

| Passo | Arquivo | Função / linhas |
|-------|---------|-----------------|
| UI | `src/pages/CustomerInvoiceDetail.tsx` | `handleReplayNotification` (~437), botão “Reenviar notificação” (~894) |
| Client | `src/services/customerInvoices.ts` | `replay-notification` (~543) |
| Route | `packages/backend/src/routes/customerInvoicesRoutes.ts` | ~37 |
| Controller | `packages/backend/src/controllers/customerInvoicesController.ts` | `replayCustomerInvoiceNotificationHandler` (~677–706) |
| Replay | `packages/backend/src/services/invoiceNotificationsService.ts` | `replayInvoiceCreatedOutbound` (172–184) |
| Publish | `packages/backend/src/services/notificationsEngine/businessTransactionalNotifications.ts` | `gateAndPublish` (77+), `publishInvoiceCreatedNotification` (715+) |
| Resolve | `whatsappSenderResolve.ts` | `resolveWhatsAppSenderUserIdForTenant` |
| Dispatch | `whatsappChannelDispatcher.ts` | `dispatchWhatsAppText` (38–112) |

**Contexto:** HTTP autenticado (`req.tenantId` + permissão `billing.send_invoice`). Idempotency **nova** a cada clique → nova delivery. **Não** agenda sino in-app.

**Pré-condição típica do “funciona”:** utilizador já visitou Dispositivos / clicou Atualizar → `getInstanceStatus` corrigiu `status` e/ou metadata antes do replay.

---

## 4. Mapa — fluxo AUTOMÁTICO (recorrência)

```
runRecurringScheduler → enqueueRenewalJobs (withBillingWorkerRlsBypass)
runRecurringWorker    → processNextBatch (RLS bypass)
                      → executeWorkerCrmRenewal / BillingExecutionOrchestrator
                      → persistCustomerInvoiceFromDraft (INSERT fatura — sem notificar)
                      → executeInvoiceNotifications
                      → notifyInvoiceCreated (origin_kind: renewal_v2)
                      → publishInvoiceCreatedNotification (idempotency estável: invoice.created:{id})
                      → [mesmo gateAndPublish → resolve → dispatch → UazAPI]
flushBillingNotificationSideEffects + processNotificationOutboundRetriesBatch
```

**Evidência:**

| Passo | Arquivo | Função |
|-------|---------|--------|
| Scheduler | `runRecurringScheduler.ts` / `recurringBillingJobService.enqueueRenewalJobs` | worker RLS bypass |
| Worker | `runRecurringWorker.ts` | batch + flush notify + retry outbound |
| Orchestrator | `billingExecution/billingExecutionOrchestrator.ts` | chama `executeInvoiceNotifications` |
| Notify hook | `billingExecution/notificationExecutionService.ts` | `notifyInvoiceCreated` |
| Notify | `invoiceNotificationsService.notifyInvoiceCreated` (186–245) | + in-app side-effect |

**Contexto:** jobs com `tenant_id` na aplicação; sessão DB com `app.bypass_rls`; side-effects de notificação usam `runDetachedFromRequestDb` (pool sem bypass). Invoice sempre filtrada por `ci.tenant_id`. Query de instância WhatsApp é por **`user_id` + status**, não por `tenant_id` na linha de `chat_instances` (tenant validado via join/`users`).

---

## 5. Comparação MANUAL vs AUTOMÁTICO

| Dimensão | Manual | Automático | Mesmo? |
|----------|--------|------------|--------|
| Stack WhatsApp final | `dispatchWhatsAppText` | Idem | **Sim** |
| Coluna token | `chat_instances.instance_token` | Idem | **Sim** |
| Filtro status | `status = 'connected'` | Idem | **Sim** |
| Resolve sender | `resolveWhatsAppSenderUserIdForTenant` | Idem | **Sim** |
| Auth HTTP | JWT + tenant request | Worker + tenant no job | Diferente entrada |
| Sync UazAPI antes do send | **Não** (mas UI refresh costuma ter corrido antes) | **Não** | Mesmo código; timing diferente |
| Idempotency | Nova key `:manual:uuid` | Estável `invoice.created:id` | Diferente |
| In-app | Não | Sim | Diferente |
| Cache de token | Nenhum | Nenhum | **Sim (ausente)** |

**Implicação RCA:** a divergência **não** é “token do scheduler vs token do utilizador”. É **quando** e **em que estado do espelho** cada fluxo tenta enviar — e se algum processo já marcou `disconnected` / token rejeitado pela UazAPI.

---

## 6. Todos os pontos que alteram `chat_instances.status`

| # | Arquivo | Função | Status | Confirma provider? |
|---|---------|--------|--------|-------------------|
| 1 | `chatController.createInstance` | INSERT com status da create UazAPI / default `disconnected` | Sim (create) |
| 2 | `chatController.connectInstance` (409) | força `disconnected` após disconnect helper | Parcial |
| 3 | `chatController.connectInstance` (invalid token recreate) | `disconnected` + novo token | Sim (erro auth) |
| 4 | `chatController.connectInstance` (sucesso) | `response.status \|\| 'connecting'` (raw) | Sim |
| 5 | `chatController.getInstanceStatus` | mapeia → `connected` / `connecting` / raw | **Sim — sync forte** |
| 6 | `getInstanceStatus` → self-heal | `disconnected` | Sim (401/invalid token) |
| 7 | `processWebhookEvent` event=`connection` | CASE open/connected→connected; close/disconnected→disconnected | **Não** (confia payload) |
| 8 | `markChatInstanceDisconnectedForInvalidToken` | `disconnected` + metadata `invalidTokenDetected*` | Caller já viu sinal |

**Callers do self-heal:**

1. `whatsappChannelDispatcher.dispatchWhatsAppText` — `source: 'dispatch_whatsapp_text'`
2. `chatController.getInstanceStatus` — `source: 'get_instance_status'`

**Não existem writers de status em:** cron de health WhatsApp, Redis, cache singleton de conexão, delete (remove row), admin scripts de webhook metadata.

---

## 7. Tokens: recuperar / invalidar

### Recuperação / reconciliação (volta a `connected`)

| Ponto | Mecanismo |
|-------|-----------|
| `GET .../instances/:id/status` (`getInstanceStatus`) | Consulta UazAPI; UPDATE se mudou |
| UI Settings WhatsApp / QR / onboarding poll | Timers 3s–15s chamam `getInstanceStatus` |
| Webhook `connection` open/connected | UPDATE sem probe extra |
| `connectInstance` sucesso | Escreve status do provider |

### Invalidação / `disconnected`

| Ponto | Mecanismo |
|-------|-----------|
| Self-heal após send 401/Invalid token | UPDATE `disconnected` |
| Self-heal após status poll 401 | Idem + HTTP 401 `UAZ_INSTANCE_TOKEN_INVALID` |
| Webhook `connection` close/disconnected | UPDATE sem confirmar |
| Connect 409 / recreate token | Escrita explícita `disconnected` |

**Nenhum cron backend** periodicamente revalida todas as instâncias.

---

## 8. Cron / workers / timers / filas (relevantes)

### Backend (`packages/backend/src/index.ts` e scripts)

| Processo | Finalidade | Relação WhatsApp status |
|----------|------------|-------------------------|
| Recurring scheduler | Enfileira jobs de renovação | Dispara fatura → notify |
| Recurring worker | Processa jobs + `flushBillingNotificationSideEffects` + `processNotificationOutboundRetriesBatch` | **Envia** WhatsApp; pode disparar self-heal |
| Notification outbound retry worker | Reentrega deliveries | Mesmo dispatcher; erros “nenhuma instância” / invalid token = **definitive** |

**Não há** health-check periódico de `chat_instances` no backend.

### Frontend (poll que **escreve** status via API)

| Componente | Intervalo | Efeito |
|------------|-----------|--------|
| `InstancesList.tsx` | 15s se `connecting`/QR | `getInstanceStatus` |
| `QRCodePopup.tsx` | 3s | `getInstanceStatus` |
| Onboarding WhatsApp | `POLL_MS` | status |
| `WhatsAppConnection.tsx` | 5s | status |
| Lista geral de dispositivos | **sem** poll contínuo se já “connected”/`disconnected` | Status stale até refresh manual |

---

## 9. Webhooks WhatsApp

| Evento | Tratado? | Altera status? |
|--------|----------|----------------|
| `connection` | Sim (~11037) | Sim via CASE |
| `logout` / `session.expired` / `instance.update` / `connection.update` | **Não** (unhandled log) | Não |
| messages / chats / leads | Sim / parcial | Não status |

**Risco:** webhook grava `disconnected` **antes** de confirmar estado real na UazAPI. Qualquer `close` transitório deixa o espelho errado até o próximo `getInstanceStatus`.

---

## 10. Fluxo de sincronização (fonte da verdade)

```
UazAPI (sessão real)
   ↑ consultada por: getInstanceStatus, sendText, connect
   ↓ webhook connection (parcial)
Backend interpreta
   ↓ UPDATE chat_instances.status  ← ESPELHO (usado no envio)
Frontend lista lê o espelho
   └─ refresh manual reconcilia via getInstanceStatus
```

| Pergunta | Resposta |
|----------|----------|
| Quem é a fonte da verdade? | **UazAPI** para sessão; **DB** para decisões de send |
| API sobrescreve banco? | Só quando algo chama status/connect/send-heal/webhook |
| Banco sobrescreve API? | Nunca |
| Frontend altera estado? | Só via API status/connect; estado local é cosmético |
| Sync bidirecional? | **Não** — unidirecional esporádico |

---

## 11. Race conditions

| Race | Ordem possível | Quem “vence” |
|------|----------------|--------------|
| Worker send self-heal → UI ainda mostra connected | Send falha → DB `disconnected` → lista stale até refresh | DB escrita do heal; UI só atualiza no reload/status |
| Webhook `close` → depois sessão ainda up | Webhook grava disconnected; ninguém reconcilia até poll | Webhook ganha até refresh |
| Webhook `open` vs self-heal 401 | Último UPDATE por `updated_at` | Último writer |
| Múltiplas `connected` no mesmo user | `dispatchWhatsAppText` `LIMIT 1` **sem ORDER BY** | **Não determinístico** |
| Resolve sender vs dispatch | Resolve escolhe user por `updated_at DESC`; dispatch pega qualquer instance connected do user | Possível instance diferente da “preferida” se multi-row |

---

## 12. Multi-tenant / cache / banco

| Tema | Achado |
|------|--------|
| Tenant no worker | Presente em `job.tenant_id` / queries de invoice; bypass RLS só no client do billing |
| Notify detach | Pool normal; invoice scoped por `tenant_id` |
| Contexto WhatsApp | Resolve por tenant → user com instance `connected`; token por `user_id` |
| Redis token/status | **Não existe** |
| Cache in-memory relevante | Flags do Notifications Engine (enable/send), **não** tokens |
| DB | Risco: duplicidade `connected` por user; sessões órfãs se token UazAPI regenerado sem update local; inconsistência API↔DB sem poll |

---

## 13. Mapeamento do erro “Token inválido”

| Camada | Mensagem / comportamento |
|--------|--------------------------|
| UazAPI HTTP | Corpo tipicamente `error` / `message` → frequentemente **`Invalid token.`** |
| `uazapi.ts` L118–119 | `throw new Error(payload?.error \|\| payload?.message \|\| …)` + `.status` |
| `dispatchWhatsAppText` catch | Propaga `msg`; se `isUazapiInvalidTokenSignal` → self-heal disconnected |
| Delivery `error_message` | String da UazAPI (EN), não um literal PT inventado pelo billing |
| `classifyWhatsAppDispatchError` | `invalid`+`token` ou 401/403 → **definitive** (sem retry) |
| UI chat | `Invalid token` / `Token inválido detectado` em connect/status — paralelo, não gera a delivery |

**Falsos positivos possíveis:** qualquer 401/403 no send (mesmo transitório de auth/gateway) dispara heal + definitive.

Outros `"Token inválido"` no repo (agendamento público, SaaS billing, Asaas webhook) **não** estão no path de fatura recorrente.

---

## 14. Logging útil (o que já existe / o que falta)

| Já existe | Onde |
|-----------|------|
| `[chat_instance_health]` JSON | self-heal mark disconnected |
| `[UazAPI] Request failed` | status + message |
| `[BILLING_NOTIFY_DELIVERY_CREATED]` | após enqueue ok |
| NE logs / `traceNotification` | invoice notify start/queue/fail |
| Webhook connection log | previousState / newState |

| Lacuna para RCA em produção | |
|-----------------------------|--|
| Correlação `invoice_id` ↔ `instance_id` ↔ últimos 8 chars do token no mesmo log de send fail | Falta campo estruturado único |
| Antes/depois do self-heal no mesmo delivery_id | Parcial |
| Confirmação “provider ainda connected?” após 401 | **Não** — heal imediato |

---

## 15. Classificação por criticidade

| ID | Problema | Criticidade | Evidência |
|----|----------|-------------|-----------|
| P1 | Envio automático confia só no espelho DB e **não** synca UazAPI | **Critical** | `whatsappSenderResolve` + `dispatchWhatsAppText` filtros |
| P2 | Self-heal marca `disconnected` no fail de send sem segundo probe | **Critical** | `chatInstanceInvalidTokenSelfHeal` + dispatcher |
| P3 | Classifier trata “nenhuma instância” / invalid token como definitive | **High** | `whatsappDispatchErrorClassifier.ts` |
| P4 | Webhook `connection` altera DB sem confirmar provider | **High** | `chatController` ~11037 |
| P5 | UI não faz poll de instâncias já “connected/disconnected” | **Medium** | `InstancesList` só poll em connecting/QR |
| P6 | `LIMIT 1` sem ORDER BY no token do user | **Medium** | dispatcher SQL |
| P7 | Vocabulário de status raw (`close` vs `disconnected`) | **Low** | getInstanceStatus vs webhook CASE |

---

## 16. Hipótese causal encadeada (cenário mais provável)

1. Em algum momento (webhook `close`, 401 transitório, ou send anterior) o banco fica `disconnected` **ou** a UazAPI rejeita o token com `Invalid token.` enquanto a sessão do telemóvel ainda parece ok ao utilizador.
2. Worker de recorrência gera fatura → resolve sender exige `connected` **ou** dispara send com token rejeitado.
3. Se send falha com invalid token → self-heal grava `disconnected` + delivery **failed definitive**.
4. Utilizador abre Configurações → WhatsApp → `getInstanceStatus` pergunta à UazAPI → se sessão ok, grava `connected` de novo.
5. “Reenviar notificação” usa o **mesmo** pipeline, agora com espelho corrigido → sucesso.

Isso explica **ambos** os sintomas reportados sem precisar de dois tokens diferentes.

---

## 17. Plano de correção priorizado (**sem implementar**)

Alinhado à decisão Camada 1+2 (definitiva):

| Ordem | Ação | Ataca |
|-------|------|-------|
| 1 | `syncChatInstanceStatusFromProvider` antes de desistir no resolve/dispatch | P1 |
| 2 | Retry após sync: reclassificar stale-mirror como transient **uma vez** | P3 |
| 3 | Self-heal só após confirmação (status probe) ou sinal inequívoco | P2 |
| 4 | Webhook `connection` close: opcionalmente confirmar com `/instance/status` antes de gravar disconnected | P4 |
| 5 | Dispatch `ORDER BY updated_at DESC LIMIT 1` + log `instance_id` | P6 |
| 6 | Poll leve na UI para instancias `disconnected` com `connectedPhone` em metadata (opcional) | P5 |

**Não fazer primeiro:** desligar self-heal sem sync (esconde falha real); só UI polling (não salva worker noturno).

---

## 18. Queries sugeridas (ops — leitura)

```sql
-- Instâncias disconnected com marca de self-heal recente
SELECT id, user_id, status, updated_at,
       metadata->>'invalidTokenDetectedAt' AS healed_at,
       left(instance_token, 8) AS token_prefix
FROM chat_instances
WHERE status = 'disconnected'
  AND metadata ? 'invalidTokenDetected'
ORDER BY updated_at DESC
LIMIT 50;

-- Deliveries WhatsApp falhas (ajustar nome/schema se diferente em prod)
SELECT id, tenant_id, entity_id, status, error_message, retry_count, updated_at
FROM notification_outbound_deliveries
WHERE channel = 'whatsapp'
  AND status IN ('failed', 'failed_transient')
  AND updated_at > now() - interval '7 days'
ORDER BY updated_at DESC
LIMIT 100;
```

---

## 19. Success criteria — checklist

| Critério | Status |
|----------|--------|
| Identificar por que DB marca disconnected | **Cumprido** — writers #6/#7/#8 + evidência de código |
| Identificar por que automático “usa token inválido” | **Cumprido** — mesmo token; erro originado na UazAPI; não há cache/token paralelo |
| Explicar manual vs automático | **Cumprido** — mesmo path; divergência em timing/espelho/idempotency/contexto entrada |
| Evidências (ficheiros/funções) | **Cumprido** — secções 3–13 |

---

*Investigação read-only. Nenhuma alteração aplicada ao sistema.*
