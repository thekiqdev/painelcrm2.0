# PHASE4_CLOSEOUT — Workers & Logs

| Campo | Valor |
|---|---|
| **Phase** | 4 — Workers & Logs |
| **Sprint** | SPRINT_PHASE4_WORKERS_AND_LOGS |
| **Data** | 2026-07-14 |
| **Gate status** | **CLOSED** |
| **Pré-requisito** | Phase 3 CLOSED |

---

## Resumo executivo

Política de logs estruturada (access log opt-in); workers densos extraídos para bootstrap isolável; SLA sem N+1 de alerts/teams; announcements 15s + skip idle. Contratos HTTP/WS/Feature Flags intactos.

## MB executados

| MB | Resultado |
|---|---|
| MB-014 | **Done** — `appLogger`, `LOG_HTTP` opt-in |
| MB-015 | **Done** — `denseWorkerBootstrap` + `workers:dense`; skip via env |
| MB-016 | **Done** — batch alerts + caches; RETURNING inactivity |
| MB-017 | **Done** — default 15s + pending probe + overlap skip |

## MB não executados

Nenhum Incomplete.

## Arquivos alterados

| Arquivo | MB |
|---|---|
| `observability/appLogger.ts` (+test) | 014 |
| `workers/denseWorkerBootstrap.ts` | 015 |
| `scripts/runDenseWorkers.ts` | 015 |
| `package.json` (`workers:dense`) | 015 |
| `services/chatSlaWorkerService.ts` | 016 |
| `config/announcementsWorkerEnv.ts` (+test) | 017 |
| `services/announcements/announcementSendWorker.ts` | 017 |
| `index.ts` | 014/015 |
| `docs/architecture/sprints/SPRINT_PHASE4_*`, `PHASE4_*` | — |
| `MASTER_IMPLEMENTATION_PLAN.md` | Gate |

## Workers alterados

Ver `PHASE4_WORKER_INVENTORY.md` (dense: kanban, announcements, SLA, scheduled msgs, avatar).

## Frequências / Logs / Benchmark

Ver inventário. Highlights: announcements **4s→15s**; access log **off by default**; SLA alerts **1 query/batch**.

## QA

| Caso | Resultado |
|---|---|
| Unit logger + announcements env | ✓ 5 passed |
| SLA batch SQL EXPLAIN | ✓ index path |
| Startup HTTP embed (default) | Dense workers ainda no HTTP (rollback-safe) |
| Isolation path | `HTTP_SKIP_DENSE_WORKERS=1` + `npm run workers:dense` |
| Smoke live all workers | Pendente restart backend |

## Regressões

Nenhuma conhecida. Semântica SLA/escalonamento preservada.

## Rollback

| Item | Como |
|---|---|
| Logs | `LOG_HTTP=1` / `LOG_LEVEL=debug` |
| Dense isolation | Remover `HTTP_SKIP_DENSE_WORKERS` (re-embed) |
| Announcements | `ANNOUNCEMENTS_SEND_POLL_MS=4000` |
| SLA | Revert `chatSlaWorkerService.ts` |

Rollback **não** executado.

## Pendências

1. Smoke startup com backend UP.  
2. Ops: decidir `HTTP_SKIP_DENSE_WORKERS=1` em staging.  
3. Não iniciar Phase 5 até aceite Gate.

## Gate Phase 4

**PHASE 4 → CLOSED**
