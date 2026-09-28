# AUDIT: Ciclo de vida do token `chat_instances` × status `connected`

**Modo:** READ ONLY  
**Data:** 2026-06-15  
**Pergunta central:** por que `chat_instances.status = 'connected'` pode persistir quando a UazAPI já rejeita o token?

---

## Resumo executivo

| Pergunta | Resposta |
|----------|----------|
| Quem grava `instance_token`? | **`createInstance`** (INSERT) e **`connectInstance`** em erro Invalid token (UPDATE na mesma linha) |
| Job periódico que valida tokens? | **Não** |
| `status` sincroniza automaticamente com UazAPI? | **Parcial** — webhook `connection` e `GET …/status` **quando a API responde OK**; **não** quando token é inválido |
| `dispatchWhatsAppText` marca `disconnected` em Invalid token? | **Não** |
| Estado `connected` + token morto é possível? | **Sim** |
| Por quanto tempo? | **Indefinidamente (D)** até webhook `disconnected`, reconexão manual (`connectInstance`), ou recriação acidental do token |
| Onde o sistema “deixa” a instância inválida como connected? | **`getInstanceStatus`** retorna 401 **sem** `UPDATE`; motor de notificações **não** toca em `status` |

**Classificação:** **C + D + E(parcial)** — status obsoleto, ausência de health-check, reconexão só no fluxo UI de connect; provider rejeita mas BD não acompanha.

---

## 1. Quem grava `chat_instances.instance_token`

### INSERT

| Arquivo | Função | Linhas | Papel |
|---------|--------|--------|-------|
| `packages/backend/src/controllers/chatController.ts` | `createInstance` | 2265–2281 | **Cria** token na UazAPI e **insere** linha nova |

```2265:2281:packages/backend/src/controllers/chatController.ts
    const inserted = await pool.query(
      `
      INSERT INTO chat_instances (
        user_id, name, external_instance_name, instance_token, status, metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `,
      [
        userId,
        data.name,
          instanceName,
          instanceToken,
          instanceStatus,
        JSON.stringify(mergedMetadata),
      ]
    );
```

### UPDATE de `instance_token` (único local no código)

| Arquivo | Função | Linhas | Papel |
|---------|--------|--------|-------|
| `chatController.ts` | `connectInstance` | 4507–4516 | **Substitui** token quando UazAPI devolve Invalid token no connect |

```4507:4516:packages/backend/src/controllers/chatController.ts
          await pool.query(
            `
            UPDATE chat_instances
            SET instance_token = $1,
                status = 'disconnected',
                metadata = COALESCE(metadata, '{}'::jsonb) || '{"tokenChanged": true}'::jsonb,
                updated_at = now()
            WHERE id = $2
            `,
            [newInstanceToken, instance.id]
          );
```

### Outros UPDATE em `chat_instances` (não alteram token)

| Arquivo | Função / contexto | O que altera |
|---------|-------------------|--------------|
| `chatController.ts` | `connectInstance` L4707–4724 | `status`, metadata, phone |
| `chatController.ts` | `getInstanceStatus` L5474–5485 | `status`, metadata |
| `chatController.ts` | webhook handler `event === 'connection'` L11031–11054 | `status` via webhook |
| `chatController.ts` | `patchInstance` L4867 | só `metadata.enabled_in_chat` |
| `adminScriptsService.ts` | `uazapi.review_webhooks` L662 | webhook flags, não token |
| `whatsappInstanceDeletionService.ts` | DELETE linha inteira | remove instância |

### Respostas

| Quem | Como |
|------|------|
| **Cria o token** | UazAPI `POST /instance/init` → `createInstance` persiste em INSERT |
| **Atualiza o token** | Apenas `connectInstance` quando detecta Invalid token (recria na UazAPI e UPDATE) |
| **Pode substituir** | Mesmo fluxo acima; não há rota separada `reconnectInstance` |

**Não existe** `reconnectInstance` como função — reconexão está **inline** em `connectInstance` (409: disconnect + reconnect L4434–4446; Invalid token: recreate L4472–4590).

---

## 2. Fluxo de criação (`createInstance`)

**Arquivo:** `chatController.ts` · `createInstance` · L2128–2300  
**UazAPI:** `uazapi.ts` · `createInstance` → `POST /instance/init` com `useAdminToken: true` · L141–149

### Cadeia

```
POST /api/chat/instances
  → uazapiService.createInstance(name, metadata)
  → UazAPI POST /instance/init
  → remoteInstance (JSON)
  → extração → INSERT chat_instances
```

### Payload UazAPI → campos usados → campo salvo

| Origem na resposta | Campo lido (L2211–2214) | Coluna `chat_instances` |
|--------------------|-------------------------|-------------------------|
| `remoteInstance.instance \|\| remoteInstance` | `instanceInfo.token \|\| remoteInstance.token` | **`instance_token`** |
| idem | `instanceInfo.name \|\| instanceInfo.instanceName \|\| data.name` | `external_instance_name` (+ `name` do body) |
| idem | `instanceInfo.status` (default `'disconnected'`) | **`status`** |
| body + resposta | metadata mesclado | **`metadata`** |

```2210:2214:packages/backend/src/controllers/chatController.ts
    const instanceInfo = remoteInstance?.instance || remoteInstance;
    const instanceToken = instanceInfo?.token || remoteInstance?.token;
    const instanceName = instanceInfo?.name || instanceInfo?.instanceName || data.name;
    const instanceStatus = instanceInfo?.status || 'disconnected';
```

---

## 3. Fluxo de health check / sincronização de `status`

### Endpoints que consultam UazAPI

| Rota | Handler | UazAPI | Atualiza BD? |
|------|---------|--------|--------------|
| `GET /api/chat/instances/:id/status` | `getInstanceStatus` L5337 | `GET /instance/status` L225–226 | **Sim**, se API responde OK e status mudou (L5473–5485) |
| `POST /api/chat/instances/:id/connect` | `connectInstance` L4384 | `POST /instance/connect` | **Sim** ao final (L4707+) |
| Webhook UazAPI `event=connection` | handler L11023–11054 | push UazAPI | **Sim** (`open`/`connected` → connected; `close`/`disconnected` → disconnected) |

### Job automático que faz poll de todas as instâncias?

**Não.**

`packages/backend/src/index.ts` agenda workers para: notificações, billing overdue, chat SLA, mensagens agendadas, etc. **Nenhum** intervalo chama `getInstanceStatus` ou valida `chat_instances.instance_token` em lote.

### Quando `status` muda sem abrir o chat?

| Gatilho | Automático? |
|---------|-------------|
| Webhook `connection` da UazAPI | **Sim**, se webhook configurado e evento entregue |
| `connectInstance` (utilizador) | Manual via UI |
| `getInstanceStatus` | Só quando cliente HTTP chama (UI faz poll **apenas** em instâncias `connecting` — `InstancesList.tsx` L112–114) |
| `invoice.created` / `dispatchWhatsAppText` | **Não** altera `status` |

**Conclusão:** para instância já `connected` com token morto, **não há sync automática** exceto webhook `connection` (se a UazAPI ainda enviar eventos com token inválido — em geral **não**).

---

## 4. Ocorrências de `"Invalid token"` — classificação

| Arquivo | Função | Linhas | Camada | Atualiza `chat_instances`? |
|---------|--------|--------|--------|----------------------------|
| `chatController.ts` | `connectInstance` | 4472–4590 | **A) UI Chat** + **D) Reconexão** | **Sim** — novo token + `disconnected` temporário |
| `chatController.ts` | `getInstanceStatus` | 5354–5370 | **A) UI Chat** (poll status) | **Não** — só HTTP 401 + log |
| `asaasWebhook.ts` | handler auth | 124 | irrelevante (Asaas) | — |
| `middleware/auth.ts` | JWT | 98 | irrelevante (sessão) | — |
| `docs/uazapi-openapi-spec.yaml` | exemplos | vários | documentação | — |

**Não encontrado em:** webhook UazAPI handler, schedulers, `dispatchWhatsAppText`, `notificationOutboundRetryWorker`, `messageService`.

| Código audit | Aplica? |
|--------------|---------|
| **A** Apenas UI Chat | **Parcial** — únicos handlers de negócio WhatsApp |
| **B** Webhook | **Não** para Invalid token |
| **C** Scheduler | **Não** |
| **D** Reconexão automática | **Só** dentro de `connectInstance` quando utilizador dispara connect |

---

## 5. Scheduler / workers (`index.ts`)

Processos periódicos relevantes (L565–658): retry de `notification_outbound_deliveries`, digest de faturas, chat SLA, mensagens agendadas.

**Validação periódica de tokens de `chat_instances`?** **Não.**

---

## 6. Estado inconsistente `connected` × token inválido

### É possível?

**Sim.**

### Mecanismo

1. Token válido → `connectInstance` ou webhook → `status = 'connected'`.
2. UazAPI invalida token (recriação noutro ambiente, revogação, instância apagada no provider, etc.).
3. BD mantém `instance_token` antigo e `status = 'connected'`.
4. Caminhos que **não** corrigem o BD:
   - `dispatchWhatsAppText` — só lê token e envia.
   - `getInstanceStatus` com Invalid token — **early return 401** sem `UPDATE` (L5354–5371).
   - UI lista instâncias `connected` — **não** faz poll de status (só `connecting`).

### Quanto tempo pode durar?

| Opção | Aplica? |
|-------|---------|
| **A** Até utilizador abrir tela | **Não** — abrir lista não revalida tokens `connected` |
| **B** Até próxima mensagem enviada | **Parcial** — falha no envio, mas **`status` permanece `connected`** |
| **C** Reconexão manual | **Sim** — `connectInstance` recria token |
| **D** Indefinidamente | **Sim** — estado padrão sem webhook `disconnected` |

**Resposta: D** (com **B** para detectar falha sem corrigir status).

---

## 7. Fluxo `invoice.created` × Invalid token

```
dispatchWhatsAppText()  [whatsappChannelDispatcher.ts L48–72]
  → SELECT instance_token WHERE status='connected'
  → uazapiService.sendTextMessage(token, …)
  → uazapi.request() L118–135 → Error("Invalid token." | "true")
  → return { ok: false, error: msg }  [L82–83]
  → notificationEngineOrchestrator L347–354 grava failed
```

**Ao receber Invalid token, marca `status='disconnected'` ou limpa token?**

**Não.** Nenhum trecho no motor de notificações altera `chat_instances`.

`whatsappDispatchErrorClassifier.ts` L14 classifica `invalid`+`token` como **`definitive`** (para de retry), mas **não** sincroniza status da instância.

---

## 8. Histórico / reconstrução de token em 2026-06-07

| Fonte | Existe? | Utilidade |
|-------|---------|-----------|
| `chat_instance_events` | **Não** | — |
| `instance_history` | **Não** | — |
| Audit table SQL | **Não** para tokens | — |
| `logUazChat` (`chatObservability.ts` L47) | **Sim** (stdout JSON) | Eventos como `instance_token_recreated_purged_local_chat` — **só em logs de servidor**, não em BD |
| `metadata.tokenChanged` | Flag booleana | Indica troca, **não** guarda token antigo |
| `metadata.lastConnect` / `lastStatusCheck` | Snapshots UazAPI | Podem existir, **sem** histórico versionado de token |

**É possível saber qual token estava ativo em 2026-06-07?**

**Não a partir do BD atual** se houve `UPDATE instance_token` na mesma linha (token anterior sobrescrito). Evidência indireta: instância `0e424bba…` criada **2026-06-08**; falhas de notificação em **2026-06-07** usaram token anterior (ver [AUDIT_UAZAPI_INVALID_TOKEN_SOURCE.md](./AUDIT_UAZAPI_INVALID_TOKEN_SOURCE.md)).

---

## 9. Classificação final

| Código | Veredito | Evidência |
|--------|----------|-----------|
| **A** Token expirado/invalidado externamente na UazAPI | **Sim** | Erro vem de `uazapi.request` |
| **B** Token recriado e BD não sincronizado | **Sim** | Invalidação no provider sem evento webhook nem poll |
| **C** Status `connected` obsoleto | **Sim** | BD não desce para `disconnected` em falha de API |
| **D** Ausência de health-check automático | **Sim** | Nenhum worker valida tokens |
| **E** Bug no fluxo de reconexão | **Parcial** | `getInstanceStatus` **não** persiste `disconnected` em Invalid token; só `connectInstance` corrige |
| **F** Falha apenas no provider | **Parcial** | Provider rejeita, mas **lacuna de sync** é do app |

**Classificação composta: C + D + E(parcial) + A/B**

---

## Onde o sistema deixa instância inválida aparecer como `connected`

### Lacuna principal

**Arquivo:** `packages/backend/src/controllers/chatController.ts`  
**Função:** `getInstanceStatus`  
**Linhas:** 5347–5371

Em Invalid token / 401 / 403: log + resposta HTTP — **sem** `UPDATE chat_instances SET status = 'disconnected'`.

### Lacuna secundária (notificações / faturas)

**Arquivo:** `packages/backend/src/services/notificationsEngine/whatsappChannelDispatcher.ts`  
**Função:** `dispatchWhatsAppText`  
**Linhas:** 48–84

Lê `status = 'connected'` e envia; em falha **não** propaga correção ao BD.

### Único sync passivo confiável (sem UI)

**Arquivo:** `chatController.ts` webhook `connection`  
**Linhas:** 11023–11054

Atualiza `status` — mas **não** trata Invalid token em chamadas API; depende da UazAPI enviar `state: close/disconnected`.

### Diagrama

```
Token invalidado na UazAPI
        │
        ├─► dispatchWhatsAppText / sendTextMessage  → falha, status BD inalterado
        ├─► getInstanceStatus (se chamado)          → 401, status BD inalterado  ◄── LACUNA
        ├─► Webhook connection (se chegar)        → pode setar disconnected
        └─► connectInstance (manual)                → recria token + reconnect
```

---

## Referências cruzadas

| Tema | Documento |
|------|-----------|
| Falha `invoice.created` + token | [AUDIT_UAZAPI_INVALID_TOKEN_SOURCE.md](./AUDIT_UAZAPI_INVALID_TOKEN_SOURCE.md) |
| `error_message = true` | [AUDIT_UAZAPI_SEND_FAILURE_TRUE.md](./AUDIT_UAZAPI_SEND_FAILURE_TRUE.md) |

---

*Auditoria READ ONLY. Nenhum dado, token ou instância alterado.*
