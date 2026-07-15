# SPRINT_PHASE5_STORE_LEGACY_COEXISTENCE_PLAN

| Campo | Valor |
|---|---|
| **Documento** | SPRINT_PHASE5_STORE_LEGACY_COEXISTENCE_PLAN |
| **Phase** | 5 — Store / Legacy Coexistence |
| **Base** | MASTER_IMPLEMENTATION_PLAN |
| **Status** | Completed |
| **Data** | 2026-07-14 |
| **Gate anterior** | Phase 4 CLOSED |
| **Closeout** | `PHASE5_CLOSEOUT.md` — Gate Phase 5 **CLOSED** |

---

## Escopo MB

| MB | Entrega | Rollback |
|---|---|---|
| MB-018 | Tracker + inventário SoT; docs canário Store | — docs |
| MB-019 | ADR-011 + Float latest-page + Load More UI; dump via `VITE_FLOAT_MESSAGES_DUMP=1` | env dump |
| MB-020 | Coalesce + invalidates cirúrgicos (sem root `floating-chat`) | revert helpers |
| MB-030 | Guard/CI sockets: bridge-first; telemetria dedicados | F1 OFF |
| MB-031 | Política Cache precedence Store > RQ > IDB | docs |
| MB-038 | ClientProfile bridge path affirmed + shared helper + CI | F1 OFF |
| MB-040 | `check:chat-sot-guards` CI | disable script |

**Sem remoção física de legado. Sem flip de catalog flags.**
