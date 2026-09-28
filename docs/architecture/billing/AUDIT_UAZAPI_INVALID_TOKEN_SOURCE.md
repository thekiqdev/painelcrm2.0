# AUDIT: UazAPI `Invalid token.` — origem do token nas deliveries `invoice.created`

**Modo:** READ ONLY  
**Data:** 2026-06-15  
**Ambiente consultado:** PostgreSQL local (`localhost:5433`, DB `painelcrm`) — **não** produção.

---

## Resumo executivo

| Pergunta | Resultado |
|----------|-----------|
| Existem deliveries `invoice.created` com `error_message = 'Invalid token.'` no BD auditado? | **Não (0 linhas)** |
| Erro dominante nas falhas `invoice.created` no BD auditado | **`true`** (17 ocorrências) — mesma camada UazAPI, payload `{ "error": true }` |
| Sender usado em sent e failed | **Mesmo** — `459afc5e-79bb-418e-b65c-94d7fe360d4f` |
| Instância atual do sender | **1** conectada — `0e424bba…` / `painelcrmevo_11981169950` / token `fc517f11…` |
| Instância criada | **2026-06-08** — **após** falhas de **2026-06-07** → indício de **recriação** |
| Múltiplas `connected` por sender | **Não** |
| Seleção de instância no dispatcher | **`LIMIT 1` sem `ORDER BY`** → ordem indefinida (não “mais recente”) |

**Classificação (BD auditado + código):** **A + F + E** — sender/instância coerentes no momento do envio; token lido do BD rejeitado pela UazAPI; falhas recentes precedem recriação da instância; erro nasce na **resposta HTTP da UazAPI**, não no motor de notificações.

---

## 1. Deliveries com `error_message = 'Invalid token.'`

```sql
SELECT id, tenant_id, entity_id, dispatch_sender_user_id, created_at
FROM notification_outbound_deliveries
WHERE event_key = 'invoice.created'
  AND status = 'failed'
  AND error_message = 'Invalid token.';
```

**Resultado:** **0 linhas**.

Busca ampliada (`ILIKE '%invalid token%'` em toda a tabela): **0 linhas**.

### Falhas `invoice.created` existentes (erro real no BD)

| delivery_id | tenant_id | entity_id | dispatch_sender_user_id | created_at | error_message |
|-------------|-----------|-----------|-------------------------|------------|---------------|
| `7c082911-eb68-43b5-9e74-4c59817c25fd` | `4ecc0b33-aecd-4489-a5ae-0d7c6395c35d` | `c9747fa1-…` | `459afc5e-79bb-418e-b65c-94d7fe360d4f` | 2026-06-07 17:00:28 UTC | **`true`** |
| (+ 16 anteriores, mesmo sender, mesmo `true`) | | | | | |

> **Nota:** `Invalid token.` e `true` são variantes do **mesmo ponto de falha** em `uazapi.ts` L119 — dependendo se a UazAPI devolve `{ "error": "Invalid token" }` (string) ou `{ "error": true }` (boolean). Ver [AUDIT_UAZAPI_SEND_FAILURE_TRUE.md](./AUDIT_UAZAPI_SEND_FAILURE_TRUE.md).

---

## 2. Deliveries `sent` recentes — comparação de sender

Últimas 30 `invoice.created` com `status = 'sent'`: **todas** usam:

| Campo | Valor |
|-------|-------|
| `dispatch_sender_user_id` | `459afc5e-79bb-418e-b65c-94d7fe360d4f` |

**Conclusão:** sent e failed usam o **mesmo sender**. A divergência não é de utilizador remetente.

---

## 3. Resolver sender (`users`)

| id | name | email |
|----|------|-------|
| `459afc5e-79bb-418e-b65c-94d7fe360d4f` | Kaique Silva Santos | kaique@agenciadev.com.br |

Fonte: `users` + `profiles` (`first_name` / `last_name`).

---

## 4. Instância WhatsApp — fluxo real de `dispatchWhatsAppText()`

**Arquivo:** `whatsappChannelDispatcher.ts`  
**Função:** `dispatchWhatsAppText()` — linhas 33–84

### Passo a passo

1. Valida membership: `users` WHERE `id = senderUserId AND tenant_id = tenantId` (L40–46).
2. Seleciona instância (L48–54):

```48:54:packages/backend/src/services/notificationsEngine/whatsappChannelDispatcher.ts
  const instanceResult = await params.pool.query<{ instance_token: string }>(
    `SELECT i.instance_token
     FROM chat_instances i
     WHERE i.user_id = $1 AND i.status = 'connected'
     LIMIT 1`,
    [params.senderUserId],
  );
```

3. Lê `instance_token` da linha (L60).
4. Chama `uazapiService.sendTextMessage(token, …)` (L65–72).

### Instância que o dispatcher escolheria hoje (sender `459afc5e…`)

| Campo | Valor |
|-------|-------|
| `chat_instances.id` | `0e424bba-580e-49c9-99e7-5f77b2ce1ca7` |
| `name` / `external_instance_name` | `painelcrmevo_11981169950` |
| `status` | `connected` |
| `token` (prefixo) | `fc517f11…` |
| `created_at` | 2026-06-08 14:26:50 UTC |
| `updated_at` | 2026-06-08 14:27:47 UTC |

**Existe mais de uma instância para esse sender?** **Não** — apenas 1 linha em `chat_instances` para `user_id = 459afc5e…`.

---

## 5. Tabela comparativa sent × failed

| delivery | status | sender_user | chat_instance_id (hoje) | instance_name | token_prefix | instance_status |
|----------|--------|-------------|-------------------------|---------------|--------------|-----------------|
| `7c082911…` | failed (`true`) | `459afc5e…` | `0e424bba…` | `painelcrmevo_11981169950` | `fc517f11…` | connected |
| `caa29fe5…` (sent, 2026-05-26) | sent | `459afc5e…` | `0e424bba…` * | idem | idem | connected |

\* A instância **atual** (`0e424bba…`) foi criada em **2026-06-08**. Deliveries **sent** de maio/2026 usaram **outra linha/token** já removida ou substituída. A comparação “mesma instância” só vale para o estado **atual** do BD.

**Perguntas do audit:**

| Pergunta | Resposta |
|----------|----------|
| Invoices sent usam outra instância? | **Historicamente sim** — envios de mai/2026 precedem a instância atual (jun/2026). |
| Invoices failed usam instância antiga? | **Sim, no momento da falha (2026-06-07)** — a instância vigente hoje só existe desde 2026-06-08. |

---

## 6. Histórico `chat_instances`

### Sender `459afc5e…` (todas as linhas)

| id | status | created_at | updated_at |
|----|--------|------------|------------|
| `0e424bba-580e-49c9-99e7-5f77b2ce1ca7` | connected | 2026-06-08 14:26:50 | 2026-06-08 14:27:47 |

**Instância mais recente do mesmo usuário?** Sim — é a única persistida.  
**Instância antiga ainda `connected`?** **Não** — não há segunda linha; a anterior foi substituída/removida (fluxo de recriação em `chatController.ts` L4472–4517).

### Tenant `4ecc0b33…` (todos os users)

Apenas a instância acima para o sender de faturas.

### Usuários com múltiplas instâncias `connected`

**0** (`GROUP BY user_id HAVING COUNT(*) > 1`).

---

## 7. Seleção do sender e da instância (código)

### Sender do tenant

**Arquivo:** `whatsappSenderResolve.ts`  
**Função:** `resolveWhatsAppSenderUserIdForTenant()` — L7–34

- Preferência por `preferredUserId` se tiver instância `connected`.
- Senão: `users` JOIN `chat_instances` WHERE `tenant_id` AND `status = 'connected'` **`ORDER BY i.updated_at DESC LIMIT 1`**.

→ Escolhe o user cuja instância conectada foi **atualizada mais recentemente**.

### Instância para envio

**Arquivo:** `whatsappChannelDispatcher.ts`  
**Função:** `dispatchWhatsAppText()` — L48–54

→ **`LIMIT 1` sem `ORDER BY`**.

| Opção | Aplica? |
|-------|---------|
| **A** Usa a mais recente | **Não** no dispatcher (só no resolve do sender, por `updated_at` do user) |
| **B** Usa a primeira encontrada | **Sim** — ordem indefinida do PostgreSQL |
| **C** Instância fixa do sender | **Parcial** — fixa ao `user_id`, mas qual linha `connected` é arbitrária se houver >1 |
| **D** Token de outro lugar | **Não** — só `chat_instances.instance_token` |

**Bindings:** não há tabela `sender_bindings`. Persistência: `notification_outbound_deliveries.dispatch_sender_user_id` (migration `131_notifications_engine_retry_and_ops.sql`).

---

## 8. Consistência `connected` × token invalidado

**Cenário possível?** **Sim.**

| Mecanismo | Detalhe |
|-----------|---------|
| Estado no BD | `dispatchWhatsAppText` só filtra `status = 'connected'` — não valida token na UazAPI antes de enviar |
| Invalidação externa | UazAPI pode invalidar token (recriação, expiração, outro host) sem atualizar o BD |
| UI de chat | `chatController.ts` L5355–5370 detecta `Invalid token` em status/connect e responde `UAZ_INSTANCE_TOKEN_INVALID` |
| Recriação | `connectInstance` L4472–4517: em `Invalid token`, cria nova instância na UazAPI, **atualiza** `instance_token`, marca `disconnected` até reconectar |
| Motor de notificações | **Não** chama status/connect antes do send — confia no token armazenado |

→ **`status = 'connected'` com token já inválido na UazAPI** é um estado realista até o utilizador reconectar ou o status ser atualizado.

---

## 9. `notification_outbound_delivery_attempts`

Deliveries `invoice.created` failed (amostra `7c082911…` e demais):

| attempt_number | status | error_message | provider_response |
|----------------|--------|---------------|-------------------|
| 1 | `failed_transient` | `true` | `{ "class": "transient", "attempt": 1 }` |
| 2–4 | `failed_transient` | `true` | `{ "via": "retry_worker", "class": "transient" }` |

**Todas as tentativas** repetem o mesmo `error_message` (`true` no BD auditado; seria `Invalid token.` se a UazAPI devolvesse string).

`provider_response` **não** guarda HTTP status nem body da UazAPI.

---

## 10. Classificação final

| Código | Veredito | Evidência |
|--------|----------|-----------|
| **A** Sender correto + instância correta + token inválido | **Sim** | Mesmo sender em sent/failed; token vem de `chat_instances`; UazAPI rejeita |
| **B** Sender correto + instância antiga escolhida | **Possível se >1 connected** | Não no estado atual (0 multi-connected); **sim no passado** se havia linha antiga ainda `connected` |
| **C** Múltiplas connected + seleção incorreta | **Não** (estado atual) | `users_with_multiple_connected = 0` |
| **D** Banco inconsistente | **Parcial** | `connected` sem token válido na UazAPI; sem segunda linha fantasma hoje |
| **E** Problema real na UazAPI | **Sim** | Erro originado em `uazapi.ts` após HTTP `!ok` |
| **F** Após recriação da instância | **Sim** | Falha 2026-06-07; instância atual criada 2026-06-08 |

**Classificação composta:** **A + E + F** (com **B/D** como mecanismo quando token antigo permanece `connected`).

---

## Camada onde o token inválido é introduzido

```
chat_instances.instance_token (BD)
    ↓
whatsappChannelDispatcher.ts :: dispatchWhatsAppText()  L48–60
    ↓
uazapi.ts :: request()  L86–135
    ↓  HTTP !ok  →  payload.error = "Invalid token" | true
    ↓
new Error(payload?.error || …)  L119
    ↓
whatsappChannelDispatcher.ts  L82–83  →  { ok: false, error: msg }
    ↓
notificationEngineOrchestrator.ts  L308–354  →  delivery.status = failed
```

| Camada | Arquivo | Função | Linhas | Papel |
|--------|---------|--------|--------|-------|
| Leitura do token | `whatsappChannelDispatcher.ts` | `dispatchWhatsAppText` | 48–60 | Lê `instance_token` de `chat_instances` |
| Origem do erro | `uazapi.ts` | `request` | 118–135 | UazAPI devolve token inválido |
| Persistência | `notificationEngineOrchestrator.ts` | `gateAndPublish` / send path | 308–354 | `error_message` na delivery |

O token **não é alterado** no pipeline de notificações — é **consumido** do BD e **rejeitado** pelo provider.

---

## Queries para reproduzir em produção

```sql
-- 1. Falhas Invalid token
SELECT id, tenant_id, entity_id, dispatch_sender_user_id, created_at, error_message
FROM notification_outbound_deliveries
WHERE event_key = 'invoice.created' AND status = 'failed'
  AND error_message ILIKE '%invalid token%'
ORDER BY created_at DESC;

-- 2. Instâncias do sender
SELECT id, name, status, LEFT(instance_token, 8) AS token_prefix,
       created_at, updated_at
FROM chat_instances
WHERE user_id = '<dispatch_sender_user_id>'
ORDER BY updated_at DESC;

-- 3. Tentativas
SELECT attempt_number, status, error_message, provider_response
FROM notification_outbound_delivery_attempts
WHERE delivery_id = '<delivery_id>'
ORDER BY attempt_number;
```

---

*Auditoria READ ONLY. Nenhum dado alterado, instância reconectada ou mensagem reenviada.*
