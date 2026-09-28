# PHASE7_DASHBOARDS

| Campo | Valor |
|---|---|
| **Phase** | 7 |
| **Data** | 2026-07-14 |
| **Fonte** | `GET /metrics/platform` (JSON ou Prometheus) |

---

## Como ligar

1. Scrape Prometheus: `GET /metrics/platform?format=prometheus` (+ token se configurado).  
2. Ou Grafana JSON datasource / script polando JSON.  
3. Painéis abaixo usam nomes de métricas do registry Phase 7.

## Dashboard HTTP

| Painel | Query / campo |
|---|---|
| Requests/s | `rate(http_requests_total[5m])` |
| Latency p50/avg | `http_request_duration_ms` avg / hist |
| Errors 4xx/5xx | `http_errors_total` by `class` |
| Throughput | sum requests by method |

## Dashboard SQL

| Painel | Campo |
|---|---|
| QPS | `sql_queries_total` |
| Latency avg | `sql_query_duration_ms.avg` |
| Slow queries | `sql_slow_queries_total` |

## Dashboard Runtime

| Painel | Campo |
|---|---|
| CPU user/system | `process_cpu_*_ratio` |
| RSS / Heap | `process_resident_memory_bytes`, `process_heap_used_bytes` |
| Event loop p50/p99/max | `nodejs_eventloop_delay_*_ms` |
| GC runs | `nodejs_gc_runs_total` |
| Uptime | `process_uptime_seconds` |

## Dashboard Workers

| Painel | Campo |
|---|---|
| Runs / failures | `worker_runs_total`, `worker_failures_total` |
| Duration | `worker_duration_ms` |
| Backlog | `worker_queue_backlog` |
| Last success | `worker_last_success_unixtime` |

## Dashboard Socket.IO

| Painel | Campo |
|---|---|
| Connected | `socketio_connected` |
| Connect/disconnect rate | `socketio_*_total` |
| Reconnects | `socketio_reconnects_total` |
| Rooms | `socketio_rooms` |
| Fan-out | `socketio_fanout_total` |

## Dashboard Chat

| Painel | Campo |
|---|---|
| Inbox / messages load | `chat_*_load_total` + hist ms |
| Realtime latency | `chat_realtime_latency_ms` |
| Unread / store / bridge | `chat_unread_*`, `chat_store_sync_total`, `chat_bridge_sync_total` |
| Client samples | `chat_client_samples_total` |

## Dashboard Cache

| Painel | Campo |
|---|---|
| Hit / miss ratio | `cache_hit_total` / (`hit`+`miss`) |
| Invalidate / warm / cold | respetivos counters |

## Notas

- Dashboards são **documentação operacional** + contrato de nomes; import Grafana JSON pode ser gerado a partir desta lista.  
- Redis Adapter real = Phase 8 (`redis_adapter_ready` permanece 0).
