# PHASE5_BENCHMARKS

| Campo | Valor |
|---|---|
| **Data** | 2026-07-14 |
| **Método** | Contagens estruturais + unit tests (API/browser offline) |

## Before → After

| Métrica | Before | After | Evidência |
|---|---|---|---|
| Floating Store message load | dump `latestPage:false` | **latest-page** (+ Load More UI desktop) | ADR-011, hook |
| Invalidate root `['floating-chat']` call sites (scan) | Chat/Float/ClientProfile/Leads | **0** (exceto wipe intencional) | `check:chat-sot-guards` |
| Aggregate invalidate bursts | N flushes | **1 flush / debounce 120ms** | unit: scheduled=3 flushes=1 |
| Sockets Chat+Profile+Kanban (F1 ON) | 1 shared | **1 shared** | bridge path |
| Dedicated socket opens (F1 OFF) | silencioso | **telemetry counters** | `recordDedicatedChatSocketOpen` |
| Cache SoT ambiguity | RQ∥Store∥IDB | **Store > RQ > IDB(never)** | `cachePrecedence.ts` |
| CI SoT regressions | nenhum | **`npm run check:chat-sot-guards`** | OK scanned=408 |

## Unit

`phase5.store-coexistence.test.ts` — 4 passed  
`store.f5.3.floating-messages.test.ts` — 13 passed  

## Live staging ⚠

HTTP counts / sockets / memory — preencher no smoke com canário F1+F5 ON.
