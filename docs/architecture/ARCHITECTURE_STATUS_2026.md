# ARCHITECTURE_STATUS_2026

| Campo | Valor |
|---|---|
| **Documento** | ARCHITECTURE_STATUS_2026 |
| **Data** | 2026-07-15 |
| **Base** | MASTER_IMPLEMENTATION_FINAL_REPORT + Ownership Closure |

---

## Estado atual

PainelCRM opera com:

- **Chat Domain Store = Runtime Core** quando `CHAT_CORE_STORE=ON` (**ADR-013** / Phase 11 prep) + dual-path OFF como rollback (MB-028).
- **Realtime Bridge** (F1) + WS-patch (F2) + engines F3 + agregação F4.
- **Virtualização / window / prefetch** (F6) no cliente.
- **Observabilidade** HTTP/SQL/Runtime/Workers/Socket/Chat (`OBS_METRICS`).
- **Multi-réplica Socket.IO** via Redis Adapter (opt-in Phase 8).
- **Zero polling Chat** (Phase 9) — atualização dinâmica via Socket / manual / bootstrap; caches sessão.
- **Chat CRM state consistency** (Phase 10A) — mutações CRM aplicam retorno HTTP na Domain Store sem reload de inbox.
- **Conversation runtime unification** (Phase 10B) — Chat/Floating writes → Domain Store; 1× normalize WS; métricas de divergência.
- **Preview ← Messages** (Phase 10D) quando thread hydrated.
- **Ownership Closure** (Sprints 1–6): Instance visibility, Float meta, open coalesce, CRM detail SoT link, Kanban residual A, Phase 11 declaration.

## Freeze / contratos

| Contrato | Estado |
|---|---|
| ADR-010 Chat Architecture Freeze | Ativo |
| ADR-011 Floating latest-page | Ativo |
| ADR-012 Redis Socket.IO Adapter | Ativo |
| ADR-013 Domain Store Runtime Core | **Accepted** (physical delete → MB-028) |
| DOMAIN_STORE_FREEZE | Ativo |
| PUBLIC_API_FREEZE | Ativo |

## Superfícies Chat

| Superfície | Notas |
|---|---|
| `/chat` | Decomposições UI Phase 6; comportamento preservado |
| Floating | Latest-page ADR-011 |
| ClientProfile / Kanban | Bridge + telemetry; sem io() residual quando F1 ON |
| Notifications socket | Satélite (não Chat SoT) |

## Escala

| Modo | Como |
|---|---|
| 1 réplica | Default — memory adapter |
| N réplicas | Redis + `SOCKET_IO_REDIS_ADAPTER` ou `CHAT_REDIS_WS` |
| Rollback | Adapter off → sticky / 1 node |

## Observabilidade

Endpoint: `GET /metrics/platform` (+ Prometheus text).  
Alertas: `PHASE7_ALERT_POLICY.md`.  
Redis health: `redis_adapter_*` + campo `redisAdapter` no JSON.

## Próximos trabalhos recomendados (fora MASTER 0–8 + Phase 9 + Ownership Closure)

1. Canário `CHAT_CORE_STORE=ON` em DEP/prod.  
2. **MB-028** remoção física dual-path (checklist Phase 11).  
3. Redis HA / production flags canary.  
4. Phase B Billing/Acquisition (MB-034/035/037).  
5. AI prep (MB-036) com ADR próprio.  
6. Kanban Opção B só com ADR + dor mensurável (Sprint 5 A vigente).

## Assinatura

| | |
|---|---|
| Plan execution (MASTER) | **Closed** |
| Ownership Closure (Sprints 1–6) | **Closed** (purge → MB-028) |
| Architecture baseline 2026-07-15 | **Stable — Domain Store Runtime Core declared** |
