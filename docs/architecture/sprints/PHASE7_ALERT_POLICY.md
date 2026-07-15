# PHASE7_ALERT_POLICY

| Campo | Valor |
|---|---|
| **Phase** | 7 |
| **Data** | 2026-07-14 |

---

## Princípios

- Alertas só com `OBS_METRICS=1` e scrape estável.  
- Preferir burn-rate / janelas 5–15m.  
- Chat FE: sampling default 5% — não alertar volume absoluto de beacons.

## Política

| Alerta | Condição sugerida | Severidade | Ação |
|---|---|---|---|
| CPU alto | `process_cpu_user_ratio + process_cpu_system_ratio > 0.85` por 10m | warning | scale / investigar hot path |
| Memória | `process_resident_memory_bytes` > budget host * 0.85 por 10m | warning | heap dump / leak |
| Event-loop | `nodejs_eventloop_delay_p99_ms > 100` por 5m | critical | bloquear deploy; achar sync CPU |
| Workers parados | `time() - worker_last_success_unixtime > 2 * poll` | critical | restart `workers:dense` / job |
| Filas / backlog | `worker_queue_backlog > threshold` por worker | warning | consumir / pausar publishers |
| SQL lento | `increase(sql_slow_queries_total[5m]) > N` | warning | EXPLAIN / Phase 3 path |
| Sockets | `socketio_connected` spike > 2× baseline 15m | warning | sticky / Capacity Phase 8 |
| HTTP 5xx | `rate(http_errors_total{class="5xx"}[5m]) > 0.5` | critical | rollback / logs `LOG_JSON` |
| Reconnect storm | `rate(socketio_reconnects_total[5m]) > baseline*5` | critical | F1/bridge / proxy timeouts |

## Silence / rollback

| Ação | Como |
|---|---|
| Desligar coleta | `OBS_METRICS=0` (+ restart) |
| Reduzir carga | `OBS_METRICS_SAMPLE_RATE=0.1` |
| Chat FE prod off | unset `VITE_CHAT_METRICS_PROD` + flag OFF |
| Sample Chat ↓ | `VITE_CHAT_METRICS_SAMPLE_RATE=0` |
