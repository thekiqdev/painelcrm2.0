# Sprint 5.0-24E — Competency Lifecycle + Job Execution Reset (Opção C)

## Objetivo

Completar o reopen de competência: após purge de fatura ou repair INV-19, o ciclo volta a `pending` **e** o job `billing_recurring_jobs` deixa de bloquear nova geração (INV-21).

## Invariante

| ID | Regra |
|----|--------|
| **INV-21** | Ciclo aberto (`pending`/`queued`/… sem `invoice_id`) não pode ter job `completed`/`failed`/`cancelled` com `result_invoice_id` apontando para fatura inexistente ou cancelada/refunded |

## Arquitetura (Opção C)

```
SubscriptionCycleLifecycle
  ├─ reopen cycle (INV-20 / INV-19 repair)
  └─ orchestrate → billingJobExecutionResetService
         └─ reset job → pending (mesmo cycle_key, sem segundo job)
```

- **Um** lifecycle de competência orquestra; módulo de job é especializado (não duplica lifecycle).
- Respeita `UNIQUE(subscription_id, cycle_key)` — revive/reset do job existente.

## Implementação

| Artefato | Papel |
|----------|--------|
| `billingJobExecutionResetService.ts` | `resetJobExecutionForReopenedCompetency`, batch, `repairJobExecutionForOpenCycles` |
| `subscriptionCycleLifecycleService.ts` | Chama reset após reopen/repair; repair INV-21 em ciclos já abertos |
| `billingManualRenewalService.ts` | `skipped_completed_cycle` delega ao reset service (fatura órfã) |
| `crmSubscriptionsController` | `repair-cycle-invariants` retorna `jobs_reset` |
| `crmSubscriptions.ts` (frontend) | Tipo de resposta inclui `jobs_reset` |

## Fluxos cobertos

1. **Delete invoice** → `reopenCyclesAfterInvoiceRemoved` → cycle `pending` + job reset.
2. **Repair manual / GET runtime / generate** → `repairInvoicedCyclesWithoutInvoice` → INV-19 + INV-21.
3. **Gerar sem repair prévio** → `ensureJobForManualGenerate` revive via reset service.

## Caso de certificação

Subscription `5aa411e6-efcc-4f7e-ad2c-6d77e7ec0eae`, cycle `6117a4b0-221e-4a2e-8949-7049d33c1c5e` (2026-07-21):

- Antes: `pending` + job `completed` com `result_invoice_id` de fatura apagada → `enqueue_failed`.
- Depois: repair ou delete+reopen reseta job → **Gerar** enfileira com sucesso.

## Testes

- `billingJobExecutionResetService.test.ts`
- `subscriptionCycleLifecycleService.test.ts` (orquestração)
- Mocks atualizados em generation/repair tests

## Fora de escopo (24E)

- UI dedicada para “job bloqueado sem violar INV-19” (operador usa **Gerar** ou **Corrigir**; repair já cobre INV-21).

## Sprint 5.0-24E.1 — Geração retroativa manual

| Problema | Worker cancelava job com `cancelled_job_cycle_mismatch_after_reschedule` quando `job.cycle_key ≠ subscription.next_billing_date` — válido para scheduler, inválido para `manualExecution` com `cycle_id` explícito. |
| Correção | `processNextBatch`: bypass do mismatch guard quando `options.manualExecution === true`. |
