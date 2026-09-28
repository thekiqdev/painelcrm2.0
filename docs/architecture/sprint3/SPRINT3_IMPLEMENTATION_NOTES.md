# Sprint 3 — Worker Foundation Enterprise

## Escopo entregue

Fundação operacional para workers (runtime, heartbeat, health, reclaim, shutdown) **sem** alterar regras financeiras, outbox semantics, notify ou workflow.

## Componentes

| Área | Caminho |
|------|---------|
| Migration | `database/init/255_platform_worker_heartbeats_p0.sql`, `supabase/migrations/20260526160000_platform_worker_heartbeats_p0.sql` |
| Runtime | `packages/backend/src/workerRuntime/` |
| Flags | `worker.runtime_v1`, `worker.heartbeat_v1`, `worker.health_v1`, `worker.reclaim_v1` (default OFF) |
| Adapters | `billingWorkerAdapter.ts` + scripts billing/outbox |

## Runtime architecture

```
Script (cron)
  └─ runWorker / runBillingOpsWorkerScript
       ├─ ALS + correlationId
       ├─ SIGINT/SIGTERM → graceful stop (finish current batch)
       ├─ [flag] upsert platform_worker_heartbeats
       ├─ [flag] reclaimStaleWorkerHeartbeats (heartbeat rows only)
       └─ runBatch(ctx) → business logic unchanged
```

## Lifecycle

1. **starting** — primeiro heartbeat (se flag ON)
2. **healthy** — batch em execução / interval heartbeat em loop
3. **degraded** — erro no batch (sem alterar retry billing/outbox)
4. **shutting_down** — após SIGTERM/SIGINT, antes do flush
5. **stopped** — processo encerrado normalmente
6. **failed** — reclaim marcou worker muito antigo (> 3× `WORKER_STALE_MINUTES`)

## Heartbeat

Tabela `platform_worker_heartbeats` coexiste com `billing_ops_heartbeat`:

- Billing continua gravando `billing_ops_heartbeat` em todo run.
- Nova tabela só é escrita com `worker.heartbeat_v1=ON`.

Campos: `worker_id`, `worker_type`, `status`, `started_at`, `last_heartbeat_at`, `last_success_at`, `last_error_at`, `correlation_id`, `lock_token`, `locked_at`, `metadata_json`.

## Reclaim (foundation)

`reclaimStaleWorkerHeartbeats` — apenas linhas em `platform_worker_heartbeats`:

- Degraded: stale < 3× threshold
- Failed: stale ≥ 3× threshold
- `clearStaleLocks` — tokens antigos na mesma tabela

**Não** altera locks de jobs billing nem claims outbox.

## Graceful shutdown

- `SIGINT` / `SIGTERM` registrados uma vez por processo
- Batch atual completa; loop interrompe antes do próximo poll
- `onFinalFlush` com timeout `WORKER_SHUTDOWN_TIMEOUT_SECONDS`
- Outbox: `onSignalShutdown` → `requestOutboxPublisherShutdown()` (compat)

## Configuração (env)

| Variável | Default |
|----------|---------|
| `WORKER_HEARTBEAT_INTERVAL_SECONDS` | 30 |
| `WORKER_STALE_MINUTES` | 15 |
| `WORKER_SHUTDOWN_TIMEOUT_SECONDS` | 120 |
| `WORKER_RECLAIM_BATCH_SIZE` | 50 |
| `WORKER_POLL_INTERVAL_MS` | 2000 |

## Observabilidade

Prefixes: `[WORKER]`, `[WORKER_HEARTBEAT]`, `[WORKER_RECLAIM]`, `[WORKER_SHUTDOWN]`, `[WORKER_HEALTH]`.

## Rollout

1. Deploy migration + código (flags OFF = comportamento legado de persistência)
2. Staging: `worker.heartbeat_v1` ON para um worker
3. Validar heartbeats + logs
4. `worker.reclaim_v1`, `worker.health_v1`, `worker.runtime_v1` progressivamente

## Rollback

- Desligar flags → sem writes em `platform_worker_heartbeats`, reclaim/health no-op
- Scripts continuam funcionando (runtime ainda loga e trata sinais)
- `billing_ops_heartbeat` inalterado

## Coexistência billing / outbox

| Worker | Script | Legacy heartbeat | Runtime |
|--------|--------|------------------|---------|
| Recurring worker | `runRecurringWorker.ts` | `billing_ops_heartbeat` worker | `runBillingOpsWorkerScript` |
| Scheduler | `runRecurringScheduler.ts` | scheduler | idem |
| Payment reconciliation | `runReconciliation.ts` | — | `runWorker` |
| Ops reconciliation | `runBillingReconciliation.ts` | — | `runWorker` |
| Outbox publisher | `runOutboxPublisherWorker.ts` | — | `runWorker` loop/one-shot |

## Fora de escopo (Sprint 4+)

- Orchestrator / workflow runtime
- Autoscaling, K8s operators
- Redis/Kafka/RabbitMQ
- Dashboards superadmin (API exposta via `getWorkerHealthSnapshot` foundation)
- Migrar billing reclaim para política unificada

## Testes

`packages/backend/src/workerRuntime/*.test.ts` — startup/shutdown, heartbeat, reclaim, health flag-off, billing adapter.
