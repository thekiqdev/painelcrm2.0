# Plano de sprints — Chatbot Flows S29 (`ensure_conversation`) + S29.1



| Campo | Valor |

|-------|-------|

| **Data** | 2026-08-06 |

| **Tipo** | Entrega de sprint |

| **Base** | [`PLAN_SPRINTS_CHATBOT_FLOWS_S28.md`](./PLAN_SPRINTS_CHATBOT_FLOWS_S28.md) §6–§7 |

| **Nome** | **S29 — Nó `ensure_conversation`** · **S29.1 — Hardening** |

| **Status** | **Feito** (S29 + S29.1) |

| **Próximo** | **S31 feito** ([`PLAN_SPRINTS_CHATBOT_FLOWS_S31.md`](./PLAN_SPRINTS_CHATBOT_FLOWS_S31.md)) · S30 **skip** ([`PLAN_SPRINTS_CHATBOT_FLOWS_S30.md`](./PLAN_SPRINTS_CHATBOT_FLOWS_S30.md)) |



---



## Meta



Transformar telefone (literal ou `{{var}}`) em conversa WhatsApp amarrada à sessão órfã (S28.1) — equivalente a “nova conversa” no `/chat`.



## Decisões aplicadas



| ID | Decisão |

|----|----------|

| **D29.1** | Sem telefone → handle `error` + `ensure_conversation.error` |

| **D29.2** | Canal da instância; limite 24h oficial documentado no help do nó / plano |

| **D29.3** | Default `reuse_policy: open` (reusa aberta por telefone+instância; senão cria) |



## Schema



```ts

{

  phone: string;              // literal ou {{var}}

  normalize_br: boolean;      // default true

  instance_id?: string | null;

  reuse_policy: 'open' | 'any' | 'always_create';

  idempotency_key?: string;   // S29.1 — opcional; ex. {{order.id}}

  last_normalized_preview?: string | null; // editor only; strip no publish

}

```



## Runtime



1. Interpola `phone` + normalização BR opcional.

2. Resolve instância (nó → start guard único → instância conectada do owner/tenant). Instância explícita desconectada → erro.

3. Se `idempotency_key` resolvido → lookup `(tenant, flow, key)`; hit reusa conversa (não cria N).

4. Find-or-create `chat_conversations` (**DM-only**; rejeita `@g.us`).

5. `UPDATE chatbot_flow_sessions.conversation_id` + seed `conversation.*` / `contact.phone`.

6. Edge `default`; `error` se telefone inválido / grupo / sem instância / desconectada.

7. Se conversa reusada já `in_progress` / assigned → **pause** (D1), sem seguir para `send_message`.



## Aceite S29



- [x] Webhook Woo (phone no map) → ensure → `send_message` com conversa bound

- [x] Número inválido → erro controlado (handle `error`)

- [x] Conversa aparece no `/chat`

- [x] Humano `in_progress` → pause (não compete com bot)

- [x] Sample webhook (S28) **não** dispara runtime (inalterado)



## Aceite S29.1



- [x] Reenvio Woo do mesmo pedido (`idempotency_key`) não abre N conversas

- [x] Rate limit webhook público (429 `rate_limited`) + logs observáveis

- [x] DM-only estrito (grupo → erro)

- [x] Instância desconectada / falha de mídia com log estruturado



## Arquivos principais



- `packages/backend/src/services/chatbotFlows/flowEnsureConversation.ts`

- `packages/backend/src/services/chatbotFlows/flowEnsureConversation.test.ts`

- `packages/backend/src/services/chatbotFlows/flowWebhookRateLimit.ts`

- `database/init/317_chatbot_flow_ensure_idempotency.sql`

- Runner: `chatbotFlowsRuntimeRunner.ts` · engine: `flowRuntimeEngine.ts`

- FE: `nodeCatalog.ts`, `NodePropertiesPanel.tsx`, palette `nodeCategories.ts`



## Não nesta entrega



- ~~**S30** send avançado~~ → **SKIP** documentado em [`PLAN_SPRINTS_CHATBOT_FLOWS_S30.md`](./PLAN_SPRINTS_CHATBOT_FLOWS_S30.md) (S28 §8; `send_message` + `delay` bastam)

- ~~**S31** gatilhos / opt-out~~ → **feito** ([`PLAN_SPRINTS_CHATBOT_FLOWS_S31.md`](./PLAN_SPRINTS_CHATBOT_FLOWS_S31.md))


