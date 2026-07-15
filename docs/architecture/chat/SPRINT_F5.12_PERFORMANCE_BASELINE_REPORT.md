# Sprint F5.12 — Performance Baseline & Telemetry

| Campo | Valor |
|---|---|
| **Sprint** | F5.12 |
| **Nome** | Performance Baseline & Telemetry |
| **Data** | 2026-07-13 |
| **Objetivo** | Baseline oficial de desempenho da arquitetura F5 (observabilidade apenas) |
| **Feature Flag** | `CHAT_CORE_METRICS` (+ `import.meta.env.DEV` / `MODE=test`) |
| **Otimização** | **Nenhuma** — esta sprint não altera comportamento |

---

## Resumo executivo

Criada a camada centralizada de telemetria do Chat Core para medir renders, reducers, selectors, subscriptions, HTTP, socket e memória **antes da F6**.

Gate obrigatório:

```
(import.meta.env.DEV || MODE === 'test') && CHAT_CORE_METRICS === true
```

Com flag OFF ou em produção: **zero coleta**, **zero logs**, **zero impacto**.

---

## Arquivos criados

| Arquivo | Função |
|---|---|
| `metrics/performanceMetrics.ts` | Gate + counters + cenários |
| `metrics/renderMetrics.ts` | Renders + `useChatPerfRender` |
| `metrics/reducerMetrics.ts` | Dispatches / tempo médio |
| `metrics/selectorMetrics.ts` | Execuções / tempo médio |
| `metrics/subscriptionMetrics.ts` | Notifies por hook |
| `metrics/httpMetrics.ts` | Classificação HTTP |
| `metrics/socketMetrics.ts` | Apply WS + flush UI |
| `metrics/memoryMetrics.ts` | Amostras + projeções |
| `metrics/report.ts` | Relatório consolidado |

---

## Instrumentação (somente observabilidade)

| Ponto | Como |
|---|---|
| Domain Store `dispatch` | `timeReducer` + sample memória em set/hydrate |
| Selectors core | `timeSelector` wrapper (mesma lógica) |
| Hooks store | `recordSubscriptionNotify` + `recordSocketUiFlush` |
| HTTP | Bridge `recordChatHttpRequest` + `inboxFetch` / `messagesFetch` |
| Realtime | `recordSocketApply` em `syncStoreFromSocketEvent` |
| UI | `useChatPerfRender` em Chat, Floating, VirtualizedMessageList, Composer |
| Cenários | `chat_open`, `conversation_open`, `incoming_message` |

**Não alterado:** reducers, commands, realtime policy, cache, APIs, UX.

---

## Como coletar a baseline (DEV)

1. Super Admin → Feature Flags → `CHAT_CORE_METRICS=ON`
2. `CHAT_CORE_STORE=ON` + `CHAT_SINGLE_SOCKET=ON` (recomendado)
3. Abrir `/chat`, selecionar conversa, receber mensagem WS
4. No console:

```js
// DevTools
import('@/features/chat-core').then((m) => m.logChatPerformanceReport())
```

Ou inspecionar `getChatPerformanceReport().baselineTemplate`.

---

## Tabela de baseline (template F5 → F6)

Valores `?` = preencher com corrida manual em staging/DEV. Projeções de memória são heurísticas determinísticas (800 B/conversa + 400 B/mensagem).

### chat_open

| Métrica | F5.12 baseline | F6 (alvo) |
|---|---|---|
| http_requests | ? | ≤ baseline |
| reducers | ? | ≤ baseline |
| selectors | ? | ↓ (virtualização) |
| subscriptions | ? | ≤ baseline |
| renders | ? | ↓ |
| mount_ms | ? | ≤ baseline |

### conversation_open

| Métrica | F5.12 baseline | F6 (alvo) |
|---|---|---|
| http_requests | ? | ≤ baseline |
| reducers | ? | ≤ baseline |
| selectors | ? | ↓ |
| renders | ? | ↓ |
| load_ms | ? | ≤ baseline |

### incoming_message

| Métrica | F5.12 baseline | F6 (alvo) |
|---|---|---|
| reducers | ? | ≈ 1–2 |
| selectors | ? | ↓ |
| renders | ? | ↓ |
| socket_latency_ms | ? (apply store) | ≤ baseline |

### memory (projeções heurísticas)

| Cenário | Bytes estimados |
|---|---|
| 100 conversas | 80 000 |
| 500 conversas | 400 000 |
| 1000 conversas | 800 000 |
| 5000 mensagens | 2 000 000 |
| 10000 mensagens | 4 000 000 |

---

## Expectativas estáticas (código / AUDIT F5)

Com aggregated ON + store ON (sem medição runtime nesta sprint):

| Evento | HTTP esperado |
|---|---|
| Abrir `/chat` | ~3–4 (instances, conversations, attendance-counts) |
| Abrir conversa | +1 GET messages (+ sync fire-and-forget) |
| Mensagem WS | 0 HTTP (Bridge → Store) |

---

## Testes

`store.f5.12.performance-baseline.test.ts` — **8 casos**:

- Telemetria OFF com `CHAT_CORE_METRICS=false`
- Reducers / selectors / subscriptions
- Socket apply + cenário `incoming_message`
- Projeções de memória
- Cenário `chat_open`
- Paridade de comportamento do store

Suite store: **118 testes** passando (110 anteriores + 8).

---

## Critérios de aceite

| Critério | Status |
|---|---|
| Nenhuma alteração funcional | ✅ |
| Nenhuma alteração visual | ✅ |
| Nenhum aumento de requisições (só métricas) | ✅ |
| Instrumentação somente DEV/test + flag | ✅ |
| Baseline documentada | ✅ |
| Pronta para comparar F6 | ✅ |

---

## API pública (diagnóstico)

```ts
import {
  getChatPerformanceReport,
  logChatPerformanceReport,
  resetChatPerformanceMetrics,
  beginPerfScenario,
  endPerfScenario,
} from '@/features/chat-core';
```

---

## Próximo passo

**F6 — Cursor, Load More e Virtualização**, usando esta tabela como referência de regressão/ganho.
