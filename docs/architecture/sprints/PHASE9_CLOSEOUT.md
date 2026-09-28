# PHASE9_CLOSEOUT — Zero Polling / Event Driven Chat

| Campo | Valor |
|---|---|
| **Phase** | 9 — Zero Polling / Event Driven Chat |
| **Sprint** | SPRINT_PHASE9_ZERO_POLLING_EVENT_DRIVEN_CHAT |
| **Data** | 2026-07-14 |
| **Gate status** | **CLOSED** |
| **Pré-requisito** | Phase 8 CLOSED |

---

## Resumo executivo

Polling contínuo do Chat foi eliminado. Dinâmica passa por Socket.IO → Store/engines; HTTP reservado a bootstrap, abrir conversa, paginação, sync/manual, F5 e inconsistências pontuais. Caches de sessão para instances/company. Métricas zero-polling em memória com `automatic_http_refresh_total = 0` como target.

## MB executados

| MB | Resultado |
|---|---|
| MB-041 Polling inventory | **Done** — `PHASE9_POLLING_INVENTORY.md` |
| MB-042 Eliminar polling Chat | **Done** — timers/paths HTTP contínuos Chat removidos |
| MB-043 Runtime cache | **Done** — TTL sessão instances + company |
| MB-044 Socket SoT updates | **Done** — sem GET pós `conversation_updated`; attendance via payload |
| MB-045 Manual refresh | **Done** — sync/toggle instrumentados; política única documentada |
| MB-046 React Query cleanup | **Done** — defaults já sem focus/reconnect; sem invalidate periódico Chat |
| MB-047 Operations dashboard | **Done** — sem tick; 1× SLA/sessão |
| MB-048 Attendance | **Done** — sem poll; Socket + login |
| MB-049 Observabilidade | **Done** — `zeroPollingMetrics` + docs |
| MB-050 Auditoria final | **Done** — `PHASE9_QA_REPORT.md` |

## Arquivos alterados (principais)

| Arquivo | MB |
|---|---|
| `chat-core/metrics/zeroPollingMetrics.ts` (+test) | 049 |
| `chat-core/runtime/bootstrap.ts` | 042, 044, 049 |
| `chat-core/unread-engine/engine.ts` | 042, 048 |
| `chat-core/index.ts` | exports métricas |
| `hooks/useChatNavUnreadCount.ts` | 042 |
| `pages/Chat.tsx` | 042–048, 045 |
| `pages/ChatKanbanPage.tsx` | 042 |
| `services/chatInstancesHttpCache.ts` | 043, 049 |
| `services/tenantCompanyHttpCache.ts` | 043, 049 |
| Docs `PHASE9_*` + plan | 041–050 |

## Restrições respeitadas

Sem alteração Domain Store contracts, Commands, Workers, SQL, Controllers REST, Redis Adapter, Feature Flags, ADR-010/011, business rules.

## Entregáveis

- `SPRINT_PHASE9_ZERO_POLLING_PLAN.md`
- `PHASE9_POLLING_INVENTORY.md`
- `PHASE9_RUNTIME_FLOW.md`
- `PHASE9_METRICS.md`
- `PHASE9_QA_REPORT.md`
- `PHASE9_CLOSEOUT.md` (este)

## Veredito

**PHASE 9 → CLOSED.** Chat runtime event-driven sem polling contínuo.
