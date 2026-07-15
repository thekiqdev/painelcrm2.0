# PHASE5_CLOSEOUT — Store / Legacy Coexistence

| Campo | Valor |
|---|---|
| **Phase** | 5 — Store / Legacy Coexistence |
| **Data** | 2026-07-14 |
| **Gate status** | **CLOSED** |
| **Pré-requisito** | Phase 4 CLOSED |

---

## Resumo executivo

Coexistência Store/legado endurecida sem remoção física: Floating latest-page (ADR-011), invalidates coalescidos/cirúrgicos, sockets bridge-first com telemetria residual, precedência de cache documentada, CI `check:chat-sot-guards`.

## MB executados

| MB | Resultado |
|---|---|
| MB-018 | Done — inventário + tracker phase docs (canário ops, sem flip catalog) |
| MB-019 | Done — ADR-011 + latest-page Float + Load More |
| MB-020 | Done — coalesce + CRM/surgical invalidates |
| MB-030 | Done — telemetry + CI gate on io() |
| MB-031 | Done — `cachePrecedence.ts` |
| MB-038 | Done — ClientProfile bridge + invalidate fix + telemetry |
| MB-040 | Done — `npm run check:chat-sot-guards` |

## MB não executados

Nenhum Incomplete.

## Arquivos alterados (principais)

- `docs/architecture/chat/ADR-011-FLOATING-LATEST-PAGE.md`
- `docs/architecture/sprints/PHASE5_*` + plan
- `floatingMessageLoadPolicy.ts`, `useFloatingConversationMessages.ts`
- `FloatingConversationWindow.tsx` (Load More)
- `floatingChatQueries.ts` (coalesce/helpers)
- `cachePrecedence.ts`, `dedicatedSocketTelemetry.ts`
- Chat / ClientProfile / Kanban / Leads / CompactProfile / MobileOverlay
- `scripts/check-chat-sot-guards.mjs`, `package.json`
- MASTER backlog/gate

## Benchmark / Inventories / QA

Ver `PHASE5_BENCHMARKS.md`, `PHASE5_STORE_INVENTORY.md`, `PHASE5_QA_REPORT.md`.

### Cache ownership

Store > RQ > IDB(never SoT)

### Socket inventory

F1 ON: shared bridge. F1 OFF: dedicated io() telemetrado (Chat, ClientProfile, KanbanAttendance). Notifications socket permanece satélite (não Chat SoT).

## Rollback

| MB | Como |
|---|---|
| 019 | `VITE_FLOAT_MESSAGES_DUMP=1` |
| 020 | reverter helpers / call sites |
| 030/038 | F1 OFF (legado) |
| 040 | remover script CI |

Rollback **não** executado.

## Pendências

1. Smoke browser canário F1+F5.  
2. Mobile Floating Load More UI (mensagens já latest-page via hook).  
3. Phase 6 — executada e **CLOSED** (`PHASE6_CLOSEOUT.md`).

## Gate Phase 5

**PHASE 5 → CLOSED**
