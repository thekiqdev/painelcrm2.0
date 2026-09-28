# PHASE9_METRICS — MB-049

| Campo | Valor |
|---|---|
| **Módulo** | `src/features/chat-core/metrics/zeroPollingMetrics.ts` |
| **Data** | 2026-07-14 |

## Contadores (memória, sessão JS)

| Métrica | Semântica | Target operação normal |
|---|---|---|
| `polling_removed_total` | Pollers Chat desativados no wire | ≥ 2 ao bootstrap F3 |
| `socket_updates_total` | Eventos Socket/window que atualizam estado | Crescente com tráfego |
| `manual_refresh_total` | Sync / toggle instância / ações manuais | Só com gesto usuário |
| `webhook_updates_total` | Reservado path webhook→client (se instrumentado) | ≥ 0 |
| `automatic_http_refresh_total` | Refresh HTTP automático periódico | **0** |
| `runtime_cache_hits` | Cache hit instances/company | Alto após warm |
| `runtime_cache_miss` | Cache miss → HTTP | Login / invalidate |

## API pública

Exportados em `@/features/chat-core`:

- `getZeroPollingMetricsSnapshot`
- `record*` helpers
- `resetZeroPollingMetricsForTests`

## Instrumentação Phase 9

| Local | Métrica |
|---|---|
| `ensureChatF3RuntimeWired` | `polling_removed_total += 2` |
| Bootstrap window message/conversation | `socket_updates_total` |
| `Chat.tsx` schedule ops (ex-tick) / WS paths | `socket_updates_total` |
| Sync conversas / sync conversa / toggle instância | `manual_refresh_total` |
| `listInstancesSingleFlight` / `getTenantCompanySingleFlight` | cache hit/miss |

## Observação

Contadores são **cliente in-memory** (alinhados a métricas Chat existentes). Não exigem mudança de feature flags, workers ou `/metrics/platform` schema. Snapshot via `getZeroPollingMetricsSnapshot()` em DEV/QA.
