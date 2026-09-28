# AUDIT: UazAPI `Error("true")` — falha em `dispatchWhatsAppText`

**Modo:** READ ONLY  
**Data:** 2026-06-15  
**Caso de referência:** delivery `7c082911` / invoice `c9747fa1-5bdd-4c56-8479-74c4f5dd2a3a`

---

## 1. `uazapi.request()` — construção do erro

**Arquivo:** `packages/backend/src/services/uazapi.ts`  
**Função:** `request()` — linhas 40–138

### Fluxo em falha HTTP

```86:135:packages/backend/src/services/uazapi.ts
    const text = await response.text();
    let payload: any = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch (error) {
        payload = text;
      }
    }
    // ...
    if (!response.ok) {
      const error = new Error(payload?.error || payload?.message || response.statusText || 'UazAPI request failed');
      (error as any).status = response.status;
      (error as any).payload = payload;
      (error as any).responseText = text;
      // ...
      throw error;
    }
```

### Respostas às perguntas

| Pergunta | Resposta |
|----------|----------|
| **`payload.error` pode ser boolean?** | **Sim.** Não há validação de tipo. Se o JSON for `{ "error": true }`, essa expressão usa o booleano `true`. |
| **`payload.message` pode ser string?** | **Sim.** Usado como fallback se `payload.error` for falsy (`""`, `0`, `false`, `null`, `undefined`). |
| **Como vira `Error.message = "true"`?** | `new Error(true)` converte o argumento com `ToString` → **`"true"`**. O mesmo ocorre se `payload.error` for a string `"true"`. |
| **Perda do body original?** | **Parcial no objeto Error:** `error.payload` e `error.responseText` são anexados (L121–122). **`response.status` e `response.statusText` não são serializados** — só `error.status` (código HTTP). |
| **Perda downstream?** | **Sim, quase total.** Ver §3 e §4. |

### O que **não** gera `"true"`

| Caminho | Mensagem típica |
|---------|-----------------|
| Falha de `fetch` (rede) | `Failed to connect to UazAPI: …` (L80) |
| Instância ausente (antes da UazAPI) | `Nenhuma instância WhatsApp ativa…` (`whatsappChannelDispatcher.ts` L57) |
| HTTP OK (`response.ok`) | Não lança — retorna `payload` (L138) |

**Conclusão §1:** `Error("true")` **só pode vir de `!response.ok`** com corpo onde `payload.error` é o **booleano `true`** (ou string `"true"`), porque o ramo da linha 118 foi executado.

---

## 2. Histórico de falhas `error_message = 'true'`

### Query

```sql
SELECT d.id::text AS delivery_id, d.entity_id AS invoice_id,
       d.created_at, d.tenant_id::text, d.retry_count, d.status
FROM notification_outbound_deliveries d
WHERE d.error_message = 'true'
ORDER BY d.created_at DESC;
```

### Amostra (BD local)

| delivery_id | invoice_id | created_at (UTC) | tenant_id | retry_count |
|-------------|------------|------------------|-----------|-------------|
| `7c082911-…` | `c9747fa1-…` | 2026-06-07 17:00:28 | `4ecc0b33-…` | 3 |
| `2b04d0e6-…` | `aa2b319d-…` | 2026-04-27 19:48:17 | `4ecc0b33-…` | 3 |
| … +18 registros | várias | 2026-04-24 → 2026-04-27 | **mesmo tenant** | 3 |

### Padrão

| Aspecto | Achado |
|---------|--------|
| **Isolado ou recorrente?** | **Recorrente** no tenant `4ecc0b33-aecd-4489-a5ae-0d7c6395c35d` — dezenas de deliveries desde abril/2026 |
| **Mesmo sender** | `dispatch_sender_user_id = 459afc5e-79bb-418e-b65c-94d7fe360d4f` em todos os casos amostrados |
| **Telefones variados** | `11920079901`, `5511981169950`, `55119811699`, `11981169950` — falha não é exclusiva de um formato |
| **Invoice junho** | Uma ocorrência entre muitas — **não é caso único** |

---

## 3. `provider_response` — tentativas da invoice `c9747fa1`

### Query

```sql
SELECT a.attempt_number, a.status, a.error_message, a.provider_response, a.duration_ms, a.created_at
FROM notification_outbound_delivery_attempts a
JOIN notification_outbound_deliveries d ON d.id = a.delivery_id
WHERE d.entity_id = 'c9747fa1-5bdd-4c56-8479-74c4f5dd2a3a'
  AND d.event_key = 'invoice.created'
ORDER BY a.attempt_number;
```

### JSON armazenado (4 tentativas)

| # | status | error_message | provider_response | duration_ms |
|---|--------|---------------|-------------------|-------------|
| 1 | `failed_transient` | `true` | `{ "class": "transient", "attempt": 1 }` | 2628 |
| 2 | `failed_transient` | `true` | `{ "via": "retry_worker", "class": "transient" }` | 2616 |
| 3 | `failed_transient` | `true` | `{ "via": "retry_worker", "class": "transient" }` | 2739 |
| 4 | `failed_transient` | `true` | `{ "via": "retry_worker", "class": "transient" }` | 2631 |

### Respostas

| Pergunta | Resposta |
|----------|----------|
| **Há body HTTP salvo?** | **Não** |
| **Há status_code?** | **Não** |
| **Há mensagem UazAPI?** | **Não** — só `error_message = "true"` na coluna de texto |

### Onde o body se perde

| Etapa | Arquivo | Função | Linhas | O que persiste |
|-------|---------|--------|--------|----------------|
| UazAPI anexa body ao Error | `uazapi.ts` | `request` | 121–122 | `error.payload`, `error.responseText` (em memória) |
| Dispatcher descarta | `whatsappChannelDispatcher.ts` | `dispatchWhatsAppText` | 81–83 | Só `e.message` → `"true"` |
| Orquestrador grava tentativa | `notificationEngineOrchestrator.ts` | `recordAttemptAndHandleSendFailure` | 63–68 | `providerResponse: { class, attempt }` apenas |
| Retry worker idem | `notificationOutboundRetryWorker.ts` | `redispatchOne` | 140–147 | `{ via, class }` apenas |

**Conclusão §3:** **C) perda do body real** — confirmada. Impossível reconstruir `response.status` ou JSON UazAPI a partir do BD.

---

## 4. `dispatchWhatsAppText()` — payload enviado

**Arquivo:** `packages/backend/src/services/notificationsEngine/whatsappChannelDispatcher.ts`  
**Função:** `dispatchWhatsAppText` — linhas 33–84

### Request UazAPI (junho — falhou)

```json
{
  "number": "11920079901",
  "text": "Olá, *11920079901*.\n\nCriamos a fatura *CINV-4ECC0B33-MQ412V64*.\n\n*Valor:* R$ 90,00\n*Vencimento:* 14/06/2026\n\n*Consulte ou pague aqui:*\nhttp://localhost:8081/pay/23eda8a6-6c68-424a-b9bf-0d80e1e4bfb4\n\nAgência Dev",
  "readchat": false,
  "readmessages": false,
  "delay": 0,
  "track_source": "painelcrm-notifications-engine"
}
```

| Campo | Valor |
|-------|-------|
| **Sender user** | `459afc5e-79bb-418e-b65c-94d7fe360d4f` |
| **Instância** | `chat_instances` com `status = 'connected'` (token presente no momento do envio) |
| **Telefone** | `11920079901` |
| **Template** | Corpo renderizado em `notification_outbound_deliveries.rendered_body` |

### Comparação maio (`sent`) vs junho (`failed`)

| Campo | Maio `97704d29` | Junho `c9747fa1` |
|-------|-----------------|------------------|
| **status** | `sent` | `failed` |
| **recipient_address** | `11920079901` | `11920079901` |
| **sender** | `459afc5e-…` | `459afc5e-…` |
| **Link na mensagem** | `https://localhost:8081/pay/…` | `http://localhost:8081/pay/…` |
| **provider_message_id** | `5511981169950:3EB0298CC3C04A646F7B03` | `NULL` |
| **Tentativas** | 1 × `success` | 4 × `failed_transient` |
| **Instância atual no BD** | — | Registro `chat_instances` criado **2026-06-08** (após falha de 07/06) — token anterior não preservado |

**Diferença observável no payload:** esquema do link (`https` vs `http`), número da fatura e token de pagamento. Telefone, sender e estrutura do template são equivalentes.

**`FRONTEND_URL` atual (`.env`):** `http://localhost:8081` — explica `http://` no corpo de junho. Maio usou `https://localhost:8081` (env ou override diferente na época).

---

## 5. UazAPI — `sendTextMessage()`

**Arquivo:** `packages/backend/src/services/uazapi.ts` — linhas 247–252

| Item | Valor |
|------|-------|
| **Método** | `POST` |
| **Path** | `/send/text` |
| **URL completa** | `{UAZAPI_BASE_URL}/send/text` → `https://entregakit.uazapi.com/send/text` |
| **Header auth** | `token: <instance_token>` |
| **Body** | JSON do §4 |
| **Timeout explícito** | **Não** — `fetch()` sem `AbortSignal` / sem `timeout` |
| **Retry interno** | **Não** — uma única chamada; retries ficam no motor (`notificationOutboundRetryWorker`) |

### OpenAPI documentado vs realidade

**Doc:** `docs/uazapi-openapi-spec.yaml` L3594–3603 — erro 400 com `error` tipo **string** (ex.: `"Missing number or text"`).

**Observado no BD:** `error_message = "true"` → corpo real provavelmente `{ "error": true }` (booleano) ou `"error": "true"`, **incompatível com o tipo documentado**.

### Duração ~2,6s por tentativa

Indica **resposta HTTP da UazAPI** (não falha instantânea local). Inconsistente com timeout de rede genérico (mensagem seria `Failed to connect to UazAPI: ETIMEDOUT` etc.).

---

## 6. Comparação maio × junho — o que mudou

| Dimensão | Maio (sent) | Junho (failed) |
|----------|-------------|----------------|
| Pipeline motor | Idêntico | Idêntico |
| Telefone destino | `11920079901` | `11920079901` |
| Sender | Mesmo user | Mesmo user |
| Instância WA | Conectada (token não arquivado) | Conectada no momento; instância atual recriada 08/06 |
| URL na mensagem | `https://localhost:8081/...` | `http://localhost:8081/...` |
| Erro persistido | — | `"true"` em 4 tentativas |
| Classificação retry | — | `transient` (porque `"true"` não casa com padrões definitivos em `whatsappDispatchErrorClassifier.ts` L7–24) |

**O que não mudou:** tenant, cliente, canal, template, telefone, sender lógico.

**O que mudou (evidência):** link público `https` → `http`; instância física recriada depois da falha; resposta UazAPI passou a ser erro HTTP com corpo que colapsa para `"true"`.

---

## 7. Classificação final

| Código | Aplica? | Evidência |
|--------|---------|-----------|
| **A** HTTP !200 | **Sim** | Ramo L118–135 só executa com `!response.ok` |
| **B** `{ error: true }` | **Mais provável** | Única explicação limpa para `Error.message === "true"` via L119 |
| **C** Perda do body | **Sim** | `provider_response` não guarda HTTP; só `class`/`attempt` |
| **D** Timeout | **Improvável** | ~2628ms + mensagem `"true"`, não texto de timeout |
| **E** Instância desconectada | **Improvável** | Teria erro do dispatcher antes da UazAPI ou `Invalid token` (string) |
| **F** Erro transitório UazAPI | **Parcial** | Classificado como `transient` no motor; causa raiz ainda é resposta de erro da API |
| **G** Payload inválido | **Possível** | Link `http://localhost` na mensagem; telefone sem `55` (mas maio enviou igual) |
| **H** Outra | — | — |

### Causa real por trás de `Error("true")`

```
UazAPI POST /send/text
  → HTTP response.ok = false
  → JSON body com campo "error" truthy = true (booleano)
  → uazapi.request() L119: new Error(true)
  → Error.message = "true"
  → dispatchWhatsAppText() L82-83: retorna { ok: false, error: "true" }
  → motor persiste error_message = "true" e descarta body/status
```

**Camada de ruptura:** **provider UazAPI** (resposta HTTP de erro), **agravada por** perda de diagnóstico no pipeline (`whatsappChannelDispatcher` + `recordAttemptAndHandleSendFailure`).

**Resposta HTTP real:** **não recuperável** do BD nem dos logs persistidos. Só disponível em:
- `error.responseText` / `error.payload` no momento do throw (não gravados), ou
- logs `[UazAPI] Request failed` no stdout (`uazapi.ts` L130–133) se o processo ainda os tiver de 2026-06-07 17:00–17:02 UTC.

### Classificação composta

**A + B + C** (HTTP erro com `{error:true}` + perda total do body no motor)

---

## Referências de código

| Papel | Arquivo | Função | Linhas |
|-------|---------|--------|--------|
| Construção do erro | `uazapi.ts` | `request` | 118–135 |
| Envio texto | `uazapi.ts` | `sendTextMessage` | 247–252 |
| Catch e truncagem | `whatsappChannelDispatcher.ts` | `dispatchWhatsAppText` | 64–83 |
| Persistência tentativa | `notificationEngineOrchestrator.ts` | `recordAttemptAndHandleSendFailure` | 53–101 |
| Classificação `"true"` → transient | `whatsappDispatchErrorClassifier.ts` | `classifyWhatsAppDispatchError` | 7–24 |
| Retry worker | `notificationOutboundRetryWorker.ts` | `redispatchOne` | 107–170 |
| URL do link na fatura | `businessTransactionalNotifications.ts` | `buildCustomerInvoicePayAbsoluteUrl` | 329–334 |

---

*Auditoria READ ONLY. Nenhuma alteração de código ou dados.*
