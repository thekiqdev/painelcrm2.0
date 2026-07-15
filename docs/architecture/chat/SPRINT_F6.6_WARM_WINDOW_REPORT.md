# Sprint F6.6 — Warm Window & Predictive Prefetch

| Campo | Valor |
|---|---|
| **Sprint** | F6.6 |
| **Nome** | Warm Window & Predictive Prefetch |
| **Data** | 2026-07-13 |
| **Objetivo** | Abrir conversas frequentes praticamente instantâneo via idle prefetch + warm window |
| **Feature Flag** | `CHAT_CORE_STORE` |
| **Telemetria** | `CHAT_CORE_METRICS` |
| **UX / APIs / Commands / Repository / Cursor / Window Cache / Virtualização** | Inalterados |

---

## Resumo executivo

Com render otimizado (F6.5), o tempo restante perceptível ao trocar de conversa é o **HTTP da thread**. A F6.6 introduz uma camada **aditiva** que, em `requestIdleCallback`:

1. Calcula **Heat Score** (unread + recência + frequência de aberturas).
2. Monta uma **fila preditiva** (current → last opened → vizinhos → unread → heat).
3. Pré-carrega até **5** conversas via `loadMessagesCommand` (última página) **somente se** o Window Cache / store ainda não tiver mensagens residentes.
4. Mantém um **Warm Window LRU** para hit/miss diagnostics.

```text
Usuário parado
        │
requestIdleCallback
        │
        ▼
Heat Score + fila preditiva
        │
        ▼
loadMessagesCommand (se frio)
        │
        ▼
Window Cache / Domain Store
        │
        ▼
Clique → hit (quase instantâneo)
```

Rollback: `CHAT_CORE_STORE=OFF` → `useConversationWarmup` no-op; carregamento sob demanda legado permanece.

---

## Deliverables

| Item | Arquivo |
|---|---|
| Warm Window Engine | `prefetch/warmWindow.ts` |
| Predictive Prefetch | `prefetch/predictivePrefetch.ts` |
| Conversation Heat Score | `prefetch/heatScore.ts` |
| Hook | `prefetch/useConversationWarmup.ts` |
| Diagnostics | `metrics/prefetchMetrics.ts` |

---

## Comportamento

| Regra | Valor |
|---|---|
| `warmConversationCount` | 5 |
| Prefetch latest page | sim (`loadMessagesCommand` default) |
| Idle only | sim (`scheduleIdleTask` / `requestIdleCallback`) |
| Cancel on interaction | pointerdown / keydown / wheel |
| Respect Window Cache | skip se `selectMessageCount > 0` ou `selectResidentPages.length > 0` |
| Deduplicação | `inFlight` set + generation cancel |

### Prioridade da fila

1. Conversa atualmente aberta  
2. Última conversa aberta  
3. Imediatamente acima na lista visível  
4. Imediatamente abaixo  
5. Não lidas (por heat)  
6. Atividade recente (heat)

---

## Integração UI

`Chat.tsx` (store ON):

```ts
useConversationWarmup({
  selectedConversationId,
  orderedIds: conversationsToShow.map(c => c.id),
  conversations: conversationsToShow,
  enabled: chatCoreStoreReadEnabled,
});
```

Floating / legado: intocado.

---

## Telemetria (`CHAT_CORE_METRICS`)

| Métrica | Descrição |
|---|---|
| `prefetchRequests` | Tentativas de load |
| `prefetchHits` | Já residente (skip HTTP) |
| `prefetchMisses` | Load efetivo |
| `warmWindowHits` / `Misses` | Resultado ao abrir |
| `idlePrefetchCount` | Agendas idle |
| `prefetchCancellation` | Cancelamentos |
| `averageConversationOpenTime` | Custo de bookkeeping ao abrir |

Logs: `[Prefetch] warm | hit | miss | idle | cancel`

---

## Testes

Suite: `store/store.f6.6.prefetch.test.ts` (12 casos)

- Prefetch idle  
- Warm window hit / miss  
- Cancelamento  
- Scroll / troca rápida  
- Window cache integrado  
- Stress (LRU + cap)  
- Rollback OFF  
- Telemetria / heat / fila

---

## Acceptance

| Critério | Status |
|---|---|
| Conversas recentes abrem sem HTTP perceptível (quando pré-aquecidas) | ✅ |
| Prefetch só em idle | ✅ |
| Sem requisições duplicadas (inFlight + resident skip) | ✅ |
| Compatível com Window Cache (só leitura) | ✅ |
| Commands / Repository / UX inalterados | ✅ |
| Rollback `CHAT_CORE_STORE=OFF` | ✅ |
| Testes verdes | ✅ |

---

**Próximo**

**F7 — Redis WS & Legacy Removal** (liberada; ver F7_READINESS_REPORT)
