# Plano de sprints — Chatbot Flows S27 (Webhook in: map + listen)

| Campo | Valor |
|-------|-------|
| **Data** | 2026-08-05 |
| **Tipo** | Plano de implementação (continuação) |
| **Base** | [`PLAN_SPRINTS_CHATBOT_FLOWS.md`](./PLAN_SPRINTS_CHATBOT_FLOWS.md) · [`PLAN_SPRINTS_CHATBOT_FLOWS_S26.md`](./PLAN_SPRINTS_CHATBOT_FLOWS_S26.md) |
| **Nome** | **Chatbot Flows — Webhook in: mapear payload e testar** |
| **Escopo** | Nó `webhook_in`; reusar `getByDotPath` / UI de map do HTTP |
| **Princípio** | 1 sprint = 1 tema; map antes de listen (menor risco) |
| **Status** | **S27 feito** · **S27.1 feito** |

---

## 1. Contexto

Hoje o Webhook in só expõe URL/token/secret. O caller precisa enviar `variables` já montadas. Falta:

1. Extrair campos do JSON do body → variáveis de sessão (como `response_map` do HTTP).
2. Ouvir/colar um payload de teste no editor (estilo n8n) para montar o map sem publicar.

Candidatos antigos (tag/kanban trigger · opt-out) ficam para **S28+**.

---

## 2. Visão dos sprints

| Sprint | Nome | Objetivo |
|--------|------|----------|
| **S27** | Mapear payload | `payload_map[]` path → variável; aplica no runtime |
| **S27.1** | Testar / Ouvir | Sample no editor + listen draft |

Ordem: **S27 → S27.1**.

---

## 3. S27 — Mapear payload

### Schema

```ts
{
  token, secret,
  payload_map: [{ path: string, variable: string }] // dotted path; variável session (dotted ok)
}
```

### Runtime

1. POST body completo = root do map (não só `variables`).
2. Após merge de `variables` explícitas + `webhook_payload`, aplica `payload_map`.
3. Paths: `data.order.id`, `variables.foo`, etc. via `getByDotPath`.

### UI

- Lista path / variável (mesmo padrão do HTTP).
- Colar JSON de exemplo → preview dos valores mapeados (sem listen realtime ainda).

### Aceite

- [x] Publish valida `payload_map`.
- [x] POST real preenche vars a partir do body.
- [x] Vars aparecem no picker do flow.
- [x] Legado sem `payload_map` continua igual.

### Entrega

- Schema FE/BE `webhookInDataSchema` + `defaultData.payload_map: []`
- `applyWebhookPayloadMap` + `extractWebhookInFromGraph.payloadMap`
- Runner `runChatbotFlowsRuntimeFromWebhook` aplica map no body
- UI `WebhookInFields`: map + sample JSON + preview
- Samples `last_payload_*` strip no publish/export
- Foreign import: regenera token + importa `payload_map`
- Testes: `flowWebhookIn.test.ts`

---

## 4. S27.1 — Testar / Ouvir

### Modelo

- Endpoint autenticado inicia janela (~60s): `POST /api/chatbot-flows/:id/webhook-in-listen`
- Ingest público one-shot (sem runtime): `POST /webhooks/chatbot-flows-listen/:listenId`
- Poll autenticado: `GET /api/chatbot-flows/:id/webhook-in-listen/:listenId?wait_ms=`
- Sample no nó: `last_payload_json` / `last_payload_at` (já strip no publish)

### Aceite

- [x] Botão **Ouvir** gera URL temporária e captura POST sem iniciar sessão.
- [x] Payload grava `last_payload_*` no draft do nó.
- [x] Click-to-map na árvore JSON atualiza `payload_map` (`HttpJsonSampleTree`).
- [x] Colar JSON continua como fallback.
- [x] Listen não usa a rota de produção `/webhooks/chatbot-flows/:token`.

### Entrega

- `flowWebhookInListen.ts` (store em memória)
- Rotas públicas + handlers auth
- UI: Ouvir / Parar + árvore click-to-map
- Testes: `flowWebhookInListen.test.ts`

---

## 5. Próximo passo

1. ~~Implementar **S27**.~~  
2. ~~Implementar **S27.1**.~~  
3. Fase seguinte: [`PLAN_SPRINTS_CHATBOT_FLOWS_S28.md`](./PLAN_SPRINTS_CHATBOT_FLOWS_S28.md) — **S28 · S28.1 · S29 · S29.1 · S31** feitos; **S30 skip** ([`PLAN_SPRINTS_CHATBOT_FLOWS_S30.md`](./PLAN_SPRINTS_CHATBOT_FLOWS_S30.md)); S31: [`PLAN_SPRINTS_CHATBOT_FLOWS_S31.md`](./PLAN_SPRINTS_CHATBOT_FLOWS_S31.md).
4. Candidatos antigos (tag/kanban · opt-out) → **S31** feito.
