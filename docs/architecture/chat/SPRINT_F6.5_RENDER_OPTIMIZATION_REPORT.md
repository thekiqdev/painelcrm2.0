# Sprint F6.5 — Realtime Render Optimization

| Campo | Valor |
|---|---|
| **Sprint** | F6.5 |
| **Nome** | Realtime Render Optimization |
| **Data** | 2026-07-13 |
| **Objetivo** | Eliminar re-renders desnecessários causados por eventos realtime |
| **Feature Flag** | `CHAT_CORE_STORE` |
| **Telemetria** | `CHAT_CORE_METRICS` |
| **UX / APIs / Domain slices** | Inalterados |

---

## Resumo executivo

Com a virtualização (F6.3/F6.4) pronta, o gargalo passou a ser: **cada dispatch WS acordava todos os hooks** que assinam o Domain Store inteiro. A F6.5 introduz:

1. **Selectors estáveis** (`useStableSelector` + equality) — só notificam React quando o slice muda.
2. **Batch de dispatches WS** (`dispatchBatch` + `runSocketBatch` + coalescing no Bridge).
3. **Memo de rows** (`ChatConversationRow` / `ChatMessageRow`) com fingerprint.

```text
Socket burst (N events)
        │
        ▼
Bridge microtask coalesce
        │
        ▼
runSocketBatch → dispatchBatch (1 notify)
        │
        ▼
useStableSelector (skip se equal)
        │
        ▼
React.memo rows (fingerprint)
```

Rollback: `CHAT_CORE_STORE=OFF` restaura caminhos legados (sem selectors estáveis / batch bridge).

---

## Deliverables

| Item | Arquivo |
|---|---|
| Fine-grained Selector Engine | `store/selectorMemo.ts` |
| Subscription Optimizer | `store/hooks/useStableSelector.ts` |
| Batch Dispatch Engine | `store/storeBatch.ts` + `createStore.dispatchBatch` |
| Render Diagnostics | `metrics/renderOptimizationMetrics.ts` |
| Conversation Row Memo | `components/chat/ChatConversationRow.tsx` |
| Message Row Memo | `components/chat/ChatMessageRow.tsx` |
| Bridge coalesce | `runtime/storeBootstrap.ts` |

### Hooks migrados para `useStableSelector`

- `useChatConversationList` (equality por fingerprint de conversas)
- `useChatMessages` (version + fingerprint de mensagens)
- `useChatSelection`
- `useConversationCursor`

### API de batch

| Função | Uso |
|---|---|
| `dispatchBatch(actions)` | N reducers, 1 notify |
| `runSocketBatch(fn)` | Agrupa vários `syncStoreFromSocketEvent` |
| `enqueueSocketActions` | Fila interna |
| Bridge `queueMicrotask` | Coalesce automático de bursts |

`syncStoreFromSocketEvent` isolado permanece síncrono (compatível com testes F5.x); bursts via Bridge usam coalesce.

---

## Telemetria

Logs: `[RenderOptimization] selector-hit | selector-miss | batch | skip-render | rerender`

Métricas: `conversationRowRenders`, `messageRowRenders`, `selectorHits`, `selectorMisses`, `subscriptionSkips`, `batchedDispatches`, `rerenderReduction`, `averageRenderCost`

---

## Testes

Suite: `store.f6.5.render-optimization.test.ts` (12 casos)

Nova mensagem, editada, entregue/lida (fingerprints), burst, batch dispatch, selector memo, conversation/message update, stress 100 WS, rollback OFF, stable references.

Suite store: **190** testes verdes.

---

## Critérios de aceite

| Critério | Status |
|---|---|
| Só componentes afetados rerenderizam | ✅ (selectors + memo) |
| Batch de eventos | ✅ |
| Selectors memoizados | ✅ |
| Referências estáveis | ✅ |
| Sem alteração visual/funcional | ✅ |
| Testes verdes | ✅ |

---

## Situação F6

| Sprint | Status |
|---|---|
| F6.0–F6.4 | ✅ |
| F6.5 Realtime Render Optimization | ✅ |
| F6.6 Prefetch & Warm Window | 🔜 |
| F6.7 Performance Certification | 🔜 |
