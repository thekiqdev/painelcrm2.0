# ARCHITECTURE_STATUS_2026

| Campo | Valor |
|---|---|
| **Documento** | ARCHITECTURE_STATUS_2026 |
| **Data** | 2026-07-14 |
| **Base** | MASTER_IMPLEMENTATION_FINAL_REPORT |

---

## Estado atual

PainelCRM opera com:

- **Chat Domain Store** (SoT quando flag ON) + coexistência legado.
- **Realtime Bridge** (F1) + WS-patch (F2) + engines F3 + agregação F4.
- **Virtualização / window / prefetch** (F6) no cliente.
- **Observabilidade** HTTP/SQL/Runtime/Workers/Socket/Chat (`OBS_METRICS`).
- **Multi-réplica Socket.IO** via Redis Adapter (opt-in Phase 8).
- **Zero polling Chat** (Phase 9) — atualização dinâmica via Socket / manual / bootstrap; caches sessão.
- **Chat CRM state consistency** (Phase 10A) — mutações CRM aplicam retorno HTTP na Domain Store sem reload de inbox.

## Freeze / contratos

| Contrato | Estado |
|---|---|
| ADR-010 Chat Architecture Freeze | Ativo |
| ADR-011 Floating latest-page | Ativo |
| ADR-012 Redis Socket.IO Adapter | Ativo |
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

## Próximos trabalhos recomendados (fora MASTER 0–8 + Phase 9)

1. Canário produção flags + Redis HA.  
2. Phase B Billing/Acquisition (MB-034/035/037).  
3. MB-028 remoção legado após período canário.  
4. AI prep (MB-036) com ADR próprio.  
5. Opcional: estender zero-polling a badges não-Chat (tickets/notifications) se desejado.

## Assinatura

| | |
|---|---|
| Plan execution | **Closed** |
| Architecture baseline 2026-07-14 | **Stable for scale-ready chat** |
