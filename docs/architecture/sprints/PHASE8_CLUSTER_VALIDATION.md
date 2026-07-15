# PHASE8_CLUSTER_VALIDATION

| Campo | Valor |
|---|---|
| **Phase** | 8 |
| **Data** | 2026-07-14 |
| **Ambiente** | Local Redis `127.0.0.1:6379` |

---

## Suite

| Teste | Resultado | Evidência |
|---|---|---|
| Adapter disabled → memory | ✅ | `redisSocketAdapter.test.ts` |
| Redis down → memory-fallback | ✅ | port 6399 ECONNREFUSED |
| Redis up → mode=redis | ✅ | `redisAdapter.bench.test.ts` |
| 2 nodes broadcast A→B | ✅ | `redisAdapter.cluster.test.ts` |

## Two-node (medido)

| Métrica | Valor |
|---|---:|
| Cross-node broadcast latency | **5.124 ms** |
| Payload | `{ from: 'A' }` recebido em client ligado ao node B |
| Room | `room:cluster` via Redis adapter |

## Rolling / restart (procedimental)

| Cenário | Resultado esperado | Validação |
|---|---|---|
| Single node | rooms locais OK | adapter off (default) |
| Backend restart com Redis | reattach adapter | boot log `redis-adapter` |
| Redis restart | ioredis reconnect + métrica `redis_adapter_reconnects_total` | health poll |
| Rolling deploy 2 réplicas | clients reconectam; fan-out via Redis | mesmo prefix |

## Presence / rooms

Salas `user:{id}` e `tenant:{id}` (já usadas no `websocketService`) passam a sincronizar entre nodes quando adapter ACTIVE — sem mudança de contrato de evento.
