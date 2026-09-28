# PHASE8_BENCHMARKS

| Campo | Valor |
|---|---|
| **Phase** | 8 |
| **Data** | 2026-07-14 |

---

## Before (single-node / adapter off)

| Métrica | Valor |
|---|---:|
| Adapter mode | memory |
| Cross-node delivery | N/A (1 node) |
| Redis attach | 0 |
| Overhead adapter | 0 |

## After (Redis local)

| Métrica | Valor |
|---|---:|
| Adapter attach | **7.804 ms** |
| Cross-node broadcast | **5.124 ms** |
| Redis PING (standalone) | **2.195 ms** |
| RSS após attach | **78.88 MB** |
| Heap após attach | **20.51 MB** |
| Fallback Redis down | ✅ <1s para memory |

## Throughput / fan-out

Cross-node emit `io.to(room).emit` validado funcionalmente (1 evento). Throughput CCU alto depende de Redis HA / ops (fora do lab desta sprint).

## Observabilidade

Novas séries: `redis_adapter_ready`, `redis_adapter_health`, `redis_ping_ms`, `redis_adapter_reconnects_total`, `socketio_nodes_reported`, scrape `redisAdapter` em `/metrics/platform`.
