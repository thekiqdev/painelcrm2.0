# Phase 4 — Worker Inventory & Benchmarks

| Campo | Valor |
|---|---|
| **Data** | 2026-07-14 |
| **Fonte** | `index.ts` + `denseWorkerBootstrap.ts` |

---

## Inventário

| Worker | Intervalo (default) | Processo | MB |
|---|---|---|---|
| Feature flags refresh | 120s | HTTP | — |
| Kanban scheduled moves | 30s (min 5s) | **Dense** | 015 |
| Proposal webhooks | 60s | HTTP | — |
| Notifications outbound retry | config | HTTP | — |
| Platform notifications retry | config | HTTP | — |
| Invoice digest | config | HTTP | — |
| Billing overdue sync | 300s | HTTP | — |
| Trial expiring notify | 6h | HTTP | — |
| **Announcements send** | **15s** (antes 4s) | **Dense** | 017 |
| Agenda reminders | 60s | HTTP | — |
| Agenda automation | 300s | HTTP | — |
| **Chat SLA automation** | 120s (min 30s) | **Dense** | 016 |
| Chat scheduled messages | 30s | **Dense** | 015 |
| WA Official campaigns | config | HTTP | — |
| Avatar cache | minutes (config) | **Dense** | 015 |
| Tickets auto-resolve | 24h | HTTP | — |
| Trial recovery / engagement / expiration | 1h–24h | HTTP | — |
| Billing scheduler/worker | `start.bat` loops | Separado (pré-existente) | — |

Dense movers: `startDenseBackgroundWorkers`. Isolamento: `HTTP_SKIP_DENSE_WORKERS=1` + `npm run workers:dense`.

---

## Frequências Before/After

| Worker | Before | After |
|---|---|---|
| Announcements poll | **4000 ms** | **15000 ms** |
| Announcements ticks/hora (idle) | **900** | **240** (−73%) |
| Announcements empty BEGIN/COMMIT | 1/tick | **0** se fila vazia (probe) |
| Chat SLA alert lookups / conv | **1 query** | **batch 1 query / tick** |
| Chat SLA teams/supervisors | N+1 | **cache Map / tick** |
| Inactivity emit | UPDATE + SELECT * | **UPDATE RETURNING** |
| HTTP /api access log | **1/request always** | **0** unless `LOG_HTTP=1` |

---

## Logs Before/After

| Fonte | Before | After |
|---|---|---|
| Access log middleware | sempre `console.log` | opt-in `LOG_HTTP=1` |
| Política | ad-hoc console.* | `appLogger` levels |
| Worker errors | console.error | `appLogger.error` |

---

## Benchmark (números reais lab)

| Métrica | Valor |
|---|---|
| Announcements poll Δ | 4s → 15s (**−73% ticks**) |
| Empty announce DB txs /h | ≤900 → **0** (sem pending) |
| SLA batch EXPLAIN (empty ids) | exec **0.369 ms**, index `idx_chat_sla_alert_conv` |
| Unit tests | appLogger 3 + announcements env 2 = **5 passed** |

CPU/event-loop processo HTTP com `HTTP_SKIP_DENSE_WORKERS=1`: timers densos **0** no HTTP (mediável via ausência de intervals densos no processo).
