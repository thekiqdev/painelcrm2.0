# B0.2.3 — Billing Job Lifecycle Trace (instrumentação forense)

**Data:** 2026-06-25  
**Modo:** READ ONLY + INSTRUMENTAÇÃO — sem alteração de regras de negócio, SQL, scheduler, worker, engine ou retry  
**Prefixo de log:** `[BILLING_JOB_TRACE]`  
**Flag:** `BILLING_JOB_LIFECYCLE_TRACE` — default **ativo**; desligar com `=false`

---

## 1. Objetivo

Produzir evidência **comprovável** de quem altera `billing_recurring_jobs` entre o clique em **Gerar próxima cobrança agora** e a resposta HTTP — para alimentar a correção definitiva na sprint seguinte.

---

## 2. Componentes criados

| Artefato | Caminho |
|----------|---------|
| Logger central | `packages/backend/src/services/billingJobLifecycleTrace.ts` |
| Flag env | `packages/backend/src/config/billingEnv.ts` → `isBillingJobLifecycleTraceEnabled()` |
| Testes | `packages/backend/src/services/billingJobLifecycleTrace.test.ts` |

### API principal

| Função | Uso |
|--------|-----|
| `runWithBillingJobTraceContext` | Propaga `correlation_id`, `worker_id`, `job_id`, `execution_mode` |
| `traceBillingJobMutation` | BEFORE/AFTER snapshot + SQL + `rows_affected` + `update_without_effect` |
| `traceBillingJobSelect` | SELECT / FOR UPDATE — `job_found`, status, retry, lock |
| `traceBillingJobPhase` | Marcos de fase sem SQL |
| `traceEngineStart` / `traceEngineFinish` | Entrada/saída do `BillingRenewalEngine` |
| `traceEngineNotReached` | Batch vazio ou SELECT sem linhas |
| `loadBillingJobSnapshot` | Snapshot read-only do job |

---

## 3. Pontos instrumentados

### Backend

| Módulo | Funções / eventos |
|--------|-------------------|
| `crmSubscriptionsController.ts` | `HTTP_POST_MANUAL_RENEW_RECEIVED`, `_RESPONSE`, `_ERROR` |
| `billingManualRenewalService.ts` | `manualGenerateRenewalNow`, `prepareJobForImmediateRun`, `ensureJobForManualGenerate`, `runSynchronousManualPipeline` |
| `recurringBillingJobService.ts` | `executeRenewalJobSynchronously`, `processNextBatch` (manual + worker), `requeueBillingRecurringJobForWindow`, lock processing, retry/fail UPDATEs |
| `billingRecurringJobPersistence.ts` | `completeBillingRecurringJob`, `cancelBillingRecurringJob` |
| `billingRenewalEngine.ts` | `ENGINE_START`, `ENGINE_FINISH` |

### Frontend (somente `console.log`)

| Arquivo | Eventos |
|---------|---------|
| `crmSubscriptions.ts` | `manual_renew_request_start`, `manual_renew_http_error`, `manual_renew_response_ok` |
| `SubscriptionRenewalActionsCard.tsx` | `manual_renew_ui_catch` |

Prefixo frontend: `[BILLING_JOB_TRACE][frontend]`

---

## 4. Campos obrigatórios em cada trace de mutação

```json
{
  "ts": "ISO-8601",
  "event": "prepare_immediate_run | warning | ...",
  "correlation_id": "...",
  "worker_id": "...",
  "subscription_id": "...",
  "job_id": "...",
  "execution_mode": "manual | automatic",
  "operation": "UPDATE | INSERT | SELECT",
  "sql": "texto exato",
  "binds": [],
  "rows_affected": 0,
  "duration_ms": 12,
  "snapshot_before": { "status", "retry_at", "locked_at", "locked_by", ... },
  "snapshot_after": { ... },
  "retry_before": null,
  "retry_after": "2026-06-25T...",
  "locked_before": null,
  "locked_after": "...",
  "locked_by_before": null,
  "locked_by_after": "manual:user:...",
  "caller_file": "...",
  "caller_line": 220,
  "caller_function": "prepareJobForImmediateRun"
}
```

### Alertas automáticos

| Evento | Condição |
|--------|----------|
| `warning` + `update_without_effect` | `UPDATE` com `rows_affected === 0` |
| `status_transition` | `old_status !== new_status` |
| `retry_at_changed` | `retry_before !== retry_after` |
| `lock_changed` | `locked_at` ou `locked_by` alterados |
| `ENGINE_NOT_REACHED` | SELECT retorna 0 linhas ou batch vazio |

---

## 5. Como reproduzir e coletar evidências

### 5.1 Subir stack com trace ativo

```bash
# default: trace ligado
./start.bat

# ou explicitamente
set BILLING_JOB_LIFECYCLE_TRACE=true
```

### 5.2 Um único clique

1. Abrir detalhe da assinatura com job problemático  
2. DevTools → Console (frontend) + terminal do backend  
3. Clicar **Gerar próxima cobrança agora** uma vez  
4. Filtrar logs: `BILLING_JOB_TRACE`

### 5.3 Timeline esperada (clique bem-sucedido no pipeline)

```
T0  [frontend] manual_renew_request_start
T1  [BILLING_JOB_TRACE] HTTP_POST_MANUAL_RENEW_RECEIVED
T2  manual_generate_renewal_now_start
T3  ensure_job_for_manual_generate_start
T4  prepare_immediate_run          → snapshot_before/after, rows_affected
T5  ensure_job_for_manual_generate_end
T6  run_synchronous_manual_pipeline_start
T7  execute_renewal_job_synchronously_start
T8  process_next_batch_start       branch=manual
T9  manual_execution_job_prepared   → UPDATE (2ª vez no batch)
T10 manual_batch_select_for_update → job_found: true|false
T11 [se false] ENGINE_NOT_REACHED + warning update_without_effect (se prepare 0 rows)
T12 [se true]  job_lock_processing → status processing
T13 ENGINE_START
T14 complete_billing_recurring_job | cancel | ...
T15 ENGINE_FINISH
T16 process_next_batch_end
T17 run_synchronous_manual_pipeline_end
T18 HTTP_POST_MANUAL_RENEW_RESPONSE
T19 [frontend] manual_renew_http_error | manual_renew_response_ok
```

---

## 6. Template de análise pós-clique (preencher com logs reais)

### Timeline completa

| T | Evento | job_id | status | retry_at | rows_affected | caller |
|---|--------|--------|--------|----------|---------------|--------|
| | | | | | | |

### Todos os UPDATEs

| Fase | rows_affected | retry_before → retry_after | status_before → status_after |
|------|---------------|----------------------------|------------------------------|
| `prepare_immediate_run` | | | |
| `manual_execution_job_prepared` | | | |
| `job_lock_processing` | | | |

### Todos os SELECTs FOR UPDATE

| Fase | job_found | row_count | status no SELECT |
|------|-----------|-----------|------------------|
| `manual_batch_select_for_update` | | | |

### Quem alterou `retry_at`

| Evento | retry_before | retry_after | caller_function |
|--------|--------------|-------------|-----------------|
| | | | |

### Quem impediu o Engine

| Evidência | Valor do log |
|-----------|--------------|
| `ENGINE_NOT_REACHED.reason` | |
| `warning.update_without_effect` | |
| `manual_batch_select_for_update.job_found` | |

### Causa raiz comprovada (preencher após 1 clique)

> _Aguardando execução com instrumentação B0.2.3 — não inferir antes dos traces._

---

## 7. Relação com B0.2.2

A auditoria B0.2.2 concluiu **estaticamente** que o fluxo para em `jobs.length === 0` após SELECT `status='pending'`.

B0.2.3 **comprova em runtime**:

- Se `prepare_immediate_run` retornou `rows_affected: 0` (job em `processing`?)  
- Se `manual_execution_job_prepared` repetiu 0 rows  
- Qual `snapshot_before.status` no momento exato do SELECT  
- Se algum UPDATE posterior regravou `retry_at` (mesmo correlation_id)

---

## 8. O que esta sprint **não** faz

- Não corrige prepare para incluir `processing`  
- Não altera frontend para tratar HTTP 400 estruturado  
- Não muda worker, scheduler, engine ou política de retry  
- Não altera SQL existente (apenas SELECTs read-only de snapshot para trace)

---

## 9. Próxima sprint (correção — fora do escopo B0.2.3)

Com os traces de um único clique, aplicar **uma** correção mínima validada por:

1. `manual_execution_job_prepared` com `rows_affected >= 1`  
2. `manual_batch_select_for_update.job_found: true`  
3. `ENGINE_START` presente  
4. `HTTP_POST_MANUAL_RENEW_RESPONSE.success: true` (ou invoice idempotente documentada)

---

*Instrumentação B0.2.3 — somente observabilidade.*
