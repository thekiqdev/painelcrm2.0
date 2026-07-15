# PHASE7_METRICS

| Campo | Valor |
|---|---|
| **Phase** | 7 |
| **Data** | 2026-07-14 |

---

## Ativação

| Env | Default | Efeito |
|---|---|---|
| `OBS_METRICS` | off | Ativa coleta + `/metrics/platform` |
| `OBS_METRICS_TOKEN` | — | Protege scrape GET (Bearer ou `?token=`) |
| `OBS_METRICS_SAMPLE_RATE` | 1 se ativo | 0..1 sampling |
| `OBS_SQL_SLOW_MS` | 200 | Slow query counter |
| `OBS_RUNTIME_POLL_MS` | 15000 | Poll runtime |
| `OBS_REDIS_METRICS_PREP` | off | Contadores Redis placeholder (Phase 8) |
| `VITE_CHAT_METRICS_PROD` | off | FE: permite métricas Chat em prod |
| `VITE_CHAT_METRICS_SAMPLE_RATE` | 0.05 | FE sampling sticky por tab |
| Flag `CHAT_CORE_METRICS` | OFF | DEV: obrigatória; Prod: alternativa ao env |

## Endpoint

| Path | Formato |
|---|---|
| `GET /metrics/platform` | JSON `{ metrics }` |
| `GET /metrics/platform?format=prometheus` | text Prometheus subset |
| `POST /metrics/platform/chat-client` | beacon FE (aggregates) |

## Catálogo (servidor)

### HTTP
`http_requests_total`, `http_errors_total`, `http_request_duration_ms`

### SQL
`sql_queries_total`, `sql_slow_queries_total`, `sql_query_duration_ms`

### Runtime
`process_uptime_seconds`, `process_resident_memory_bytes`, `process_heap_*`, `process_cpu_*_ratio`, `nodejs_eventloop_delay_*`, `nodejs_gc_runs_total`

### Workers (API record)
`worker_runs_total`, `worker_failures_total`, `worker_duration_ms`, `worker_queue_backlog`, `worker_last_success_unixtime`

### Socket.IO
`socketio_connections_total`, `socketio_disconnects_total`, `socketio_reconnects_total`, `socketio_connected`, `socketio_rooms`, `socketio_broadcasts_total`, `socketio_fanout_total` (API)

### Cache (API record)
`cache_hit_total`, `cache_miss_total`, `cache_invalidate_total`, `cache_warm_total`, `cache_cold_total`

### Redis prep
`redis_adapter_ready` (=0), `redis_metrics_prep_enabled`, `redis_adapter_noop_total`

### Chat
`chat_inbox_load_*`, `chat_messages_load_*`, `chat_realtime_latency_ms`, `chat_unread_events_total`, `chat_store_sync_total`, `chat_bridge_sync_total`, `chat_client_samples_total`

## Custo / overhead (medido)

Microbench `bench-overhead.mjs` (OBS_METRICS=1, sample=1, 10k ops SQL+worker):

| Métrica | Valor |
|---|---:|
| total_ms | **45.919** |
| per_op_us | **4.592** |
| rss_before_mb | 65.43 |
| rss_after_mb | 67.34 |

Com `OBS_METRICS` off: `record*` early-return (custo ~0).
