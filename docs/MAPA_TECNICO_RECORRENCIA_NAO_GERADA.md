# Mapa técnico — Recorrência não gerada / diagnóstico

## Endpoints relevantes

| Método | Rota | Função |
|--------|------|--------|
| GET | `/api/customer-invoices/:id/recurrence-insight` | Estado para o bloco “Recorrência” (`getCustomerInvoiceRecurrenceInsightHandler`) |
| GET | `/api/customer-invoices/:id/recurrence-history` | Histórico de faturas da mesma `subscription_id` |
| PATCH | `/api/customer-invoices/:id/recurrence/next-billing` | Atualiza `subscriptions.next_billing_date` (fatura **paga** + origin subscription); cancela jobs `pending` |
| PATCH | `/api/customer-invoices/:id` | Edita fatura (vencimento, itens, gateway) via `patchCustomerInvoiceWithGateway` — **não** altera `subscriptions` |

**Nota:** só o PATCH `…/recurrence/next-billing` alinha a **data de ciclo** da assinatura com o que o scheduler usa. O PATCH genérico da fatura atualiza `customer_invoices` apenas (`customerInvoiceAdminService.ts`).

---

## Scripts / processos (CLI)

| Script | Ficheiro | Responsabilidade |
|--------|----------|-------------------|
| Scheduler | `packages/backend/src/scripts/runRecurringScheduler.ts` | Chama `enqueueRenewalJobs()` |
| Worker | `packages/backend/src/scripts/runRecurringWorker.ts` (referência típica no repo) | Chama `processNextBatch(workerId)` |

**Serviço núcleo:** `packages/backend/src/services/recurringBillingJobService.ts`

---

## Controllers e serviços

| Camada | Ficheiro |
|--------|----------|
| Insight | `packages/backend/src/services/customerInvoiceRecurrenceInsightService.ts` |
| PATCH fatura (sem subscription) | `packages/backend/src/services/customerInvoiceAdminService.ts` |
| Próxima renovação (paid) | `packages/backend/src/services/customerInvoiceRecurrenceNextBillingService.ts` |
| Janela local (Fase 2) | `packages/backend/src/services/billingTimeWindowObservability.ts` → `buildBillingWindowDiagnostic` |
| Preferências tenant | `packages/backend/src/services/tenantBillingPreferencesService.ts` |
| Jobs (ops / superadmin) | `packages/backend/src/services/billingRecurringJobsOpsService.ts` |

---

## Tabela `subscriptions` (campos usados pelo motor)

| Campo | Uso |
|-------|-----|
| `id` | Ligação `customer_invoices.subscription_id` |
| `tenant_id` | RLS / filtros |
| `status` | Scheduler: exige `'active'` |
| `type` | Worker: ramo `customer` vs `saas` vs cancelamento |
| `next_billing_date` | **Dia do ciclo** candidato; `cycle_key` no job costuma ser este YYYY-MM-DD |
| `billing_interval`, `billing_anchor_day` | Cálculo do próximo período após renovação |
| `current_period_start`, `current_period_end` | Cancelamento pós-período se `cancel_at_period_end` |
| `cancel_at_period_end` | Validação no worker |

---

## Tabela `billing_recurring_jobs`

| Campo | Uso |
|-------|-----|
| `subscription_id`, `tenant_id` | Chaves; insight filtra por ambos |
| `cycle_key` | Texto (YYYY-MM-DD do ciclo); **UNIQUE** com `subscription_id` |
| `scheduled_at` | Filtro worker: `scheduled_at <= now()` |
| `retry_at` | Requeue erro / janela Fase 2 |
| `status` | `pending` → `processing` → `completed` / `failed` / `cancelled` |
| `completion_outcome`, `completion_detail` | Outcomes tipo `completed_no_invoice_no_eligible_items`, `cancelled_manual_next_billing_reschedule`, etc. |
| `result_invoice_id` | Fatura gerada ou reutilizada (idempotência) |
| `updated_at` | Insight: “último processamento” |

**Constraint:** `UNIQUE(subscription_id, cycle_key)` + `ON CONFLICT DO NOTHING` no insert do scheduler.

---

## Tabela `tenants` (Fase 1/2)

| Campo | Uso |
|-------|-----|
| `timezone` | IANA; fallback se inválido |
| `recurring_generate_time_local` | Hora mínima local no dia de `next_billing_date` |
| `invoice_notify_*` | Fase 4 (notificação); **não** decide geração da fatura |

---

## Pontos da UI

| Componente | Ficheiro |
|------------|----------|
| Bloco Recorrência | `src/components/invoices/InvoiceRecurrenceBlock.tsx` |
| Detalhe fatura (carrega insight) | `src/pages/CustomerInvoiceDetail.tsx` |
| Novo / editar fatura (`editFlow`: `invoice` vs `renewal`) | `src/pages/CustomerInvoiceNew.tsx` |
| Serviço API | `src/services/customerInvoices.ts` — `getRecurrenceInsight`, `updateRecurrenceNextBilling` |

**Origem dos textos “Sem processamento recente” / “aguardando scheduler”:**  
`InvoiceRecurrenceBlock.tsx` + `getCustomerInvoiceRecurrenceInsight` quando `latest` é `null`.

---

## Logs relevantes (`billingLog` / prefixo configurável)

| Evento (exemplo) | Origem |
|------------------|--------|
| `enqueue_run`, `enqueue_done` | Scheduler |
| `time_window_scheduler_skip_outside_window` | Scheduler, Fase 2 skip |
| `time_window_scheduler_eligible` | Scheduler (verbose) |
| `enqueue_job_inserted`, `enqueue_skipped_*` | Scheduler |
| `batch_start`, `job_processing_start` | Worker |
| `time_window_worker_requeued_outside_window` | Worker, Fase 2 |
| `customer_subscription_next_billing_manual` | PATCH próxima renovação |

**Flags:** `BILLING_SCHEDULER_VERBOSE`, `BILLING_TIME_WINDOW_VERBOSE` (`packages/backend/src/config/billingEnv.ts`).

---

## Queries SQL sugeridas (diagnóstico)

```sql
-- Fatura vs assinatura (segunda trilha: due_date ≠ next_billing_date)
SELECT ci.id, ci.due_date::text, ci.subscription_id::text, ci.status, ci.origin,
       s.next_billing_date::text
FROM customer_invoices ci
LEFT JOIN subscriptions s ON s.id = ci.subscription_id
WHERE ci.id = '<invoice_uuid>';

-- Assinatura e tenant
SELECT s.id, s.status, s.type, s.next_billing_date, s.tenant_id,
       t.timezone, t.recurring_generate_time_local
FROM subscriptions s
JOIN tenants t ON t.id = s.tenant_id
WHERE s.id = '<subscription_uuid>';

-- Jobs
SELECT id, status, cycle_key, scheduled_at, retry_at, attempts,
       completion_outcome, result_invoice_id, created_at, updated_at
FROM billing_recurring_jobs
WHERE subscription_id = '<subscription_uuid>'
ORDER BY updated_at DESC;

-- Calendário do servidor (sessão)
SELECT current_date AS db_current_date, now() AS db_now;
```

---

## Dependências entre fases (preservadas nesta análise)

- **Fase 0:** diagnóstico de janela (logs).
- **Fase 1:** colunas em `tenants` + API de preferências.
- **Fase 2:** scheduler + worker aplicam `buildBillingWindowDiagnostic` para decisão real + requeue.
- **Fase 3:** UI de horários (não substitui scheduler/worker).
- **Fase 4:** `dispatch_not_before` em notificações — **não** impede criação da fatura pelo billing worker.
