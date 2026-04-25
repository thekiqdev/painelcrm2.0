# Mapa técnico — Job na fila sem processar / sem invoice

## Funções e ficheiros centrais

| Peça | Ficheiro |
|------|----------|
| Janela local Fase 2 | `packages/backend/src/services/billingTimeWindowObservability.ts` — `buildBillingWindowDiagnostic` |
| Preferências efetivas tenant | `packages/backend/src/services/tenantBillingPreferencesService.ts` (via `resolveTenantBillingPreferences`) |
| Worker batch | `packages/backend/src/services/recurringBillingJobService.ts` — `processNextBatch` |
| Requeue janela (+15 min) | `recurringBillingJobService.ts` — `requeueBillingRecurringJobForWindow`, `buildWindowRequeueAt`, `WINDOW_REQUEUE_MINUTES = 15` |
| Renovação CRM cliente | `recurringBillingJobService.ts` — `processOneCustomerRenewalJob` |
| CLI worker (1 run) | `packages/backend/src/scripts/runRecurringWorker.ts` |
| Insight UI | `packages/backend/src/services/customerInvoiceRecurrenceInsightService.ts` |
| Bloco UI | `src/components/invoices/InvoiceRecurrenceBlock.tsx` |

---

## Query real de seleção do worker

```sql
SELECT id, subscription_id, tenant_id, job_type, cycle_key, scheduled_at, retry_at, status, attempts, max_attempts
FROM billing_recurring_jobs
WHERE status = 'pending'
  AND scheduled_at <= now()
  AND (retry_at IS NULL OR retry_at <= now())
ORDER BY scheduled_at ASC
LIMIT 100
FOR UPDATE SKIP LOCKED;
```

**Implicações:**

- `processing` **nunca** aparece nesta query.
- `retry_at` no futuro → job **excluído** até à hora.

---

## Estados relevantes em `billing_recurring_jobs`

| Campo | Papel |
|-------|--------|
| `status` | `pending` → `processing` → `completed` / `failed` / `cancelled` |
| `scheduled_at` | Filtro `<= now()` na pickup |
| `retry_at` | Após requeue Fase 2 ou erro; bloqueia pickup até `<= now()` |
| `locked_at`, `locked_by` | Preenchidos em `processing` |
| `completion_outcome` | Ex.: `completed_no_invoice_no_eligible_items`, `cancelled_job_cycle_mismatch_after_reschedule` |
| `completion_detail` | JSON (ex.: `no_eligible_recurring_items_for_cycle`) |
| `result_invoice_id` | Nova fatura ou reuso idempotente |
| `updated_at` | Atualizado em requeue → afeta “Último processamento” no insight |

---

## Pontos de lock / retry

| Evento | Efeito |
|--------|--------|
| Pickup | `status = processing`, `locked_at = now()`, `locked_by = workerId` |
| Janela local inválida | `requeueBillingRecurringJobForWindow`: volta `pending`, `retry_at = now+15m`, limpa lock |
| Erro no try | `attempts++`, `retry_at` escalonado, `status` pending ou failed |

**Ausência no código analisado:** reset automático de `processing` antigo.

---

## Regra temporal (resumo)

**Mesmo dia** (`next_billing_date === local_now_ymd`): elegível se `local_now_hhmm >= recurring_generate_time_local` (minuto inclusivo), **resto do dia** continua elegível.

**Dia do ciclo já passou** no calendário local (`next_billing_date < local_now_ymd`): elegível **sem** comparar hora nesse ramo.

---

## Criação de invoice (CRM)

| Passo | Onde |
|-------|------|
| Itens recorrentes da fatura do período anterior | `processOneCustomerRenewalJob` |
| Filtros `is_recurring`, `itemDue`, E2 child path | `resolveMainRenewalItemDue`, `includedItems` |
| Zero itens | `completeBillingRecurringJob` com `COMPLETED_NO_INVOICE_NO_ELIGIBLE_ITEMS` |
| Criar invoice | `createCustomerInvoice` + insert linhas |

---

## Logs úteis (`billingLog`)

| Evento | Significado |
|--------|-------------|
| `worker`, `batch_start` | Início do batch; `batchSize` |
| `job`, `time_window_worker_requeued_outside_window` | Requeue +15 min; ver `window_reason` |
| `job`, `job_error` | Exceção; seguido de retry ou failed |
| `job`, `customer_renewal_completed_without_invoice` | Ciclo sem nova invoice (itens) |

Variáveis: `BILLING_TIME_WINDOW_VERBOSE`, logs do worker em stdout (`runRecurringWorker.ts`).

---

## UI — origem das mensagens

| Mensagem | Origem no código |
|----------|------------------|
| “Job na fila ou em processamento (N…)” | `pending_jobs_count` + flag `is_queued` |
| “Último processamento” | `latest.updated_at` |
| “Cobrança na fila — será processada…” | Último job `status === 'pending'` |

**Nota:** não há distinção na mensagem entre “pending livre” e “pending com `retry_at` futuro”.

---

## SQL rápido de diagnóstico

Ver `INVESTIGACAO_JOB_RECORRENCIA_NAO_PROCESSADO.md` secção 2.

---

## Evidência de ambiente (sessão atual)

- Terminal aberto observado: `cwd` em `packages/backend`, `last_command` = `npx tsx src/migrate.ts`.
- Saída recente do terminal contém migrações, sem logs de `billing:worker`/`billing:scheduler`.
- Implicação: pode haver job em `pending` sem consumidor ativo nesta sessão.
