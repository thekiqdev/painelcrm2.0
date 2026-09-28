# AUDIT F6 — Performance Certification

| Campo | Valor |
|---|---|
| **Documento** | AUDIT_F6_PERFORMANCE_CERTIFICATION |
| **Tipo** | Auditoria read-only (certificação) |
| **Versão** | 1.0 |
| **Data** | 2026-07-13 |
| **Fase certificada** | F6 — Cursor, Window Cache, Virtualização, Render Opt, Warm Prefetch |
| **Phase marker** | `chatCore.phase = 'F6.6'` (código entregue; F6.7 = certificação) |
| **Próxima fase** | F7 — Redis WS & Legacy Removal |
| **Modo** | Investigação estática + suite automatizada (202 testes store) |
| **Código alterado nesta sprint** | **Nenhum** |

---

## Veredito

### **GO condicionado para F7**

A arquitetura F6 (F6.0–F6.6) está **certificada estruturalmente**: Source of Truth Domain Store + cursor/load-more + window cache + virtualização + otimização de render + warm window, todos atrás de `CHAT_CORE_STORE`, com rollback OFF intacto e **202/202** testes store verdes.

| Critério | Resultado |
|---|---|
| F6.0–F6.6 entregues e documentados | ✅ |
| Suite store automatizada | ✅ **202/202** |
| Feature flag única de SoT (`CHAT_CORE_STORE`) | ✅ |
| Rollback OFF intacto (dual path) | ✅ |
| Virtualização ON (Chat store) | ✅ F6.3 + F6.4 |
| Window Cache ON | ✅ F6.2 |
| Warm Window / Prefetch ON | ✅ F6.6 |
| Telemetria instrumentada (DEV + `CHAT_CORE_METRICS`) | ✅ F5.12 + F6.* metrics |
| Baseline runtime Network/Profiler preenchida | ⚠️ Template estático; **fill manual em staging** — ver [`PERFORMANCE_BASELINE_F6.md`](./PERFORMANCE_BASELINE_F6.md) |
| Remoção física do legado | ❌ **0 Removido** — planejada; ver [`LEGACY_REMOVAL_READINESS.md`](./LEGACY_REMOVAL_READINESS.md) |
| F7 Redis WS implementado | ❌ Fora de escopo — liberado para início |

**Condições para GO pleno de produção (canário):**

1. Staging com `CHAT_CORE_STORE=ON` + `CHAT_SINGLE_SOCKET=ON` + Aggregated APIs ON + `CHAT_CORE_METRICS=ON` (só DEV/test).
2. Preencher células `?` do baseline F6 em corrida monitorada (Network + console getters).
3. Checklist UX §12 de [`AUDIT_F5_FINAL.md`](./AUDIT_F5_FINAL.md) + virtualização/scroll/prefetch sem regressão visual.

---

## Arquitetura certificada F6

```text
HTTP (hidratação)
  loadInboxCommand / loadMessagesCommand / loadMessagesCursorCommand
        │
        ▼
 Domain Store (SoT) ── Window Cache (F6.2) ── Cursor (F6.0/F6.1)
        │
        ├── Bridge → syncStoreFromSocketEvent → dispatchBatch (F6.5)
        │
        ├── useStableSelector (F6.5)
        │
        ├── Conversation Virtual Engine (F6.3)
        ├── Message Virtual Engine (F6.4)
        │
        └── Warm Window + idle prefetch (F6.6)
                │
                ▼
        Chat.tsx (store ON) / Floating (store ON, dump residual)
```

Rollback:

```text
CHAT_CORE_STORE=OFF → useState/RQ + TanStack virtual + load sob demanda (sem warm window)
```

---

## Auditoria por seção

### 1. HTTP Performance

| Item | Evidência estática | Status |
|---|---|---|
| Requests ao abrir `/chat` | F5.12: ~3–4 (instances, conversations, attendance-counts) com agregado ON | ✅ Alvo ≤4 (design) |
| Requests ao trocar conversa | +1 GET messages (latest page); sync fire-and-forget opcional | ✅ Alvo ≤1 mensagem (+ sync classificado) |
| Requests durante realtime | Bridge → Store; sem invalidate quando store ON | ✅ Alvo 0 HTTP após WS |
| Duplicatas HTTP | Commands unificados F5.9/F5.10; prefetch dedupe `inFlight` F6.6 | ✅ Código |
| Prefetch effectiveness | `prefetchMetrics` hit/miss; skip se residente | ✅ Instrumentado |

**Risco residual:** Floating ancora `latestPage: false` (dump) — pode inflar HTTP em float cold open; Chat enterprise path não.

### 2. React Performance

| Item | Evidência | Status |
|---|---|---|
| Conversation renders | Virt F6.3 + `ChatConversationRow` memo F6.5 | ✅ |
| Message renders | Virt F6.4 + `ChatMessageRow` memo F6.5 | ✅ |
| Commit time / FPS | Proxies: `scrollFPS` / renderSavings metrics | ⚠️ Precisa Profiler live |
| Skipped renders | `subscriptionSkips` / selector hits F6.5 | ✅ Instrumentado |
| Batch efficiency | `dispatchBatch` + Bridge microtask coalesce | ✅ |

### 3. Domain Store

| Item | Evidência | Status |
|---|---|---|
| Dispatch count | `reducerMetrics` | ✅ |
| Reducer / selector timings | `timeReducer` / `timeSelector` | ✅ |
| Subscriptions | `subscriptionMetrics` + `useStableSelector` skip | ✅ |
| Memory footprint | `memoryMetrics` heurística + window eviction | ✅ Proxy |

### 4. Window Cache

| Item | Evidência | Status |
|---|---|---|
| Resident pages / evictions | `windowMetrics` + F6.2 suite | ✅ |
| Reload rate / cache hit | `windowMetrics` hits/misses/reloads | ✅ |

### 5. Warm Window

| Item | Evidência | Status |
|---|---|---|
| Prefetch hit/miss | `prefetchMetrics` | ✅ |
| Average open latency | `averageConversationOpenTime` (bookkeeping) | ⚠️ UX latency = Network + paint |
| Idle utilization | `idlePrefetchCount` + cancel | ✅ |

### 6. Realtime

| Item | Evidência | Status |
|---|---|---|
| Socket burst / batch | F6.5 `runSocketBatch` / `dispatchBatch` | ✅ |
| Apply latency | `socketMetrics` | ✅ |
| HTTP after WS | Policy store ON; chat/floating gates | ✅ Design; ⚠️ Network confirm |

### 7. Legacy Readiness

Ver [`LEGACY_REMOVAL_READINESS.md`](./LEGACY_REMOVAL_READINESS.md). Resumo: **29 Migrado / 21 Ativo / 0 Removido**. Pronto para **plano de remoção pós-canário**, não para delete imediato.

---

## Suite automatizada

| Bloco | Testes |
|---|---|
| Store total | **202** |
| F6.0–F6.6 | **84** |
| Pré-F6 (F5.*) | **118** |

Corrida desta auditoria: `npx vitest run src/features/chat-core/store` → **20 files / 202 passed** (2026-07-13).

---

## Runtime validation requerida (operador)

Flags recomendadas:

| Flag | Valor |
|---|---|
| `CHAT_CORE_STORE` | ON |
| `CHAT_SINGLE_SOCKET` | ON |
| Aggregated (CHAT / SIDEBAR / FLOAT) | ON |
| `CHAT_CORE_METRICS` | ON (somente DEV/test) |

Coleta:

```js
import('@/features/chat-core').then(async (m) => {
  m.logChatPerformanceReport?.();
  console.table(m.getWindowMetricsSnapshot?.());
  console.table(m.getPrefetchMetricsSnapshot?.());
  console.table(m.getRenderOptimizationMetricsSnapshot?.());
  console.table(m.getConversationVirtualizationMetricsSnapshot?.());
  console.table(m.getMessageVirtualizationMetricsSnapshot?.());
});
```

---

## Documentos irmãos

| Entregável | Papel |
|---|---|
| [`PERFORMANCE_BASELINE_F6.md`](./PERFORMANCE_BASELINE_F6.md) | Comparativo F5.12 × F6 + template de fill |
| [`LEGACY_REMOVAL_READINESS.md`](./LEGACY_REMOVAL_READINESS.md) | O que pode sair pós-canário |
| [`F7_READINESS_REPORT.md`](./F7_READINESS_REPORT.md) | Liberação oficial F7 |

---

## Assinatura

| Campo | Valor |
|---|---|
| **Fase** | F6 |
| **Status** | **Certificada (GO condicionado)** |
| **Bloqueio F7** | Nenhum arquitetural F6 — F7 pode iniciar |
| **Bloqueio remoção física legado** | Canário produção + checklist live baseline |
| **Architecture Freeze** | [`F6_ARCHITECTURE_FREEZE_REPORT.md`](./F6_ARCHITECTURE_FREEZE_REPORT.md) / [`ADR-010`](./ADR-010-CHAT-ARCHITECTURE-FREEZE.md) |
