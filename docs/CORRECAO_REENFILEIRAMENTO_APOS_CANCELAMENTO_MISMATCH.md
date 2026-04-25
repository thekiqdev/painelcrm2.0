# Correção — reenfileiramento após cancelamento por mismatch de ciclo

## Por que o job era cancelado

O worker compara `billing_recurring_jobs.cycle_key` com `subscriptions.next_billing_date`. Se divergirem, o job é **obsoleto** (reagendamento após enfileiramento) e é cancelado com `cancelled_job_cycle_mismatch_after_reschedule`. Esse cancelamento é **legítimo** e foi mantido.

## Por que isso não era o “bug” principal

O bug operacional era **deixar a recorrência sem job `pending` elegível** para o ciclo atual após esse cancelamento, quando as regras de negócio já permitiriam enfileirar. O cancelamento em si apenas expunha a lacuna: **nenhum reenfileiramento automático** acontecia no worker, e PATCH/scheduler podiam falhar ou ser opacos quanto ao motivo.

## Causa real de ficar sem novo `pending`

1. O worker **não** tentava enfileirar após o mismatch.
2. `tryEnqueue` devolvia motivos genéricos (`outside_local_window`) sem distinguir `future_local_date` vs `too_early_local_time`.
3. Insight/UI não mostravam **por ciclo** (`cycle_key` = `next_billing_date`) se havia fila nem o bloqueio previsto pela mesma lógica do scheduler.

## O que foi corrigido (implementação)

### 1. Worker — Opção A (segura)

Após cancelar por mismatch, no **mesmo** contexto de conexão do billing (`pool` → client do bypass):

- `describeRenewalEnqueueWithDb` calcula bloqueios (CURRENT_DATE + Fase 2 + previsão só-leitura de insert/reativação).
- Se **não** houver `block_reason`, chama `insertOrReactivateRenewalJob` **uma vez** (idempotente: mesmos guards que o scheduler/PATCH).
- Se houver bloqueio, regista `post_cycle_mismatch_enqueue_blocked` com `block_reason` e, quando aplicável, `predicted_insert` / janela.
- Erros inesperados: `post_cycle_mismatch_enqueue_error` (não aborta o batch).

Não há “reenfileiramento cego”: só corre se a descrição indicar que o insert é permitido (equivalente ao `tryEnqueue` bem-sucedido antes da escrita).

### 2. PATCH e `tryEnqueue`

- Motivos de janela Fase 2 explícitos: `future_local_date`, `too_early_local_time` (mantido `outside_local_window` como reserva).
- Resposta de falha pode incluir `window_reason` (valor de `BillingWindowReason`).
- Log `customer_subscription_next_billing_manual` inclui `enqueue_after_patch_window_reason` quando existir.

### 3. Descrição reutilizável

- `describeRenewalEnqueueWithDb` / `describeRenewalEnqueueForSubscriptionId` — só leitura, mesma base que scheduler/PATCH.
- `predictInsertOrReactivateRenewalJob` — espelha a decisão de `insertOrReactivateRenewalJob` sem INSERT/UPDATE.
- `renewalEnqueueBlockReasonMessagePt` — mensagens estáveis para UI/logs.

### 4. Scheduler

- Logs `enqueue_skipped_insert_guard` com `insert_guard: skipped_active_exists | skipped_completed_cycle` (sempre; verbose mantém logs antigos).

### 5. Insight (GET recurrence-insight)

- `renewal_enqueue_status`: `current_cycle_key`, `pending_jobs_for_current_cycle`, `why_no_job_for_cycle` (código + texto + `window_reason` + `predicted_insert` quando não há pending no ciclo).
- Novo `visual_tag`: `stale_after_reschedule` quando o último job foi cancelado por mismatch **e** não há pending para o `cycle_key` atual.

### 6. UI

- `InvoiceRecurrenceBlock`: alerta “Enfileiramento do ciclo atual” com detalhes; badge/ícone para `stale_after_reschedule`.
- `CustomerInvoiceNew` (PATCH próxima renovação): textos para os novos motivos + `window_reason` no toast quando existir.

## Regra final do cancelamento por mismatch

- **Continua** a cancelar jobs obsoletos (`cycle_key` ≠ `next_billing_date`).
- **Em seguida**, o worker tenta **um** caminho idempotente de `insertOrReactivateRenewalJob` se, e somente se, a descrição prévia não tiver `block_reason`.

## Idempotência e riscos remanescentes

- **Preservado:** não reabre `completed`; não duplica `pending`/`processing` para o mesmo `cycle_key`; reativa só `cancelled`/`failed` no mesmo ciclo.
- **Corrida:** entre `predict` e `INSERT` outro processo pode enfileirar — `insertOrReactivate` e UNIQUE tratam como antes (`skipped_active_exists`).
- **Risco residual:** se o worker e o scheduler escreverem no mesmo instante, comportamento continua o do motor atual (sem segunda fatura no mesmo ciclo enquanto `completed` guard existir).

## Checklist de aceite

- [x] Job obsoleto continua podendo ser cancelado por mismatch.
- [x] Recorrência tem caminho consistente de reenfileiramento após mismatch quando elegível (worker + PATCH + scheduler inalterados na essência).
- [x] PATCH reenfileira/reativa quando elegível; motivos explícitos quando não.
- [x] Motivos de não reenfileirar explícitos (API, logs, insight).
- [x] UI/insight não mascaram ausência de job no ciclo atual.
- [x] Idempotência preservada (guards `completed` / `pending` / `processing`).
- [ ] Regressão billing manual / gateway: requer validação manual em ambiente de staging (fora do escopo automático deste patch).

## Ficheiros alterados (referência)

- `packages/backend/src/services/recurringBillingJobService.ts`
- `packages/backend/src/services/customerInvoiceRecurrenceNextBillingService.ts`
- `packages/backend/src/services/customerInvoiceRecurrenceInsightService.ts`
- `src/services/customerInvoices.ts`
- `src/components/invoices/InvoiceRecurrenceBlock.tsx`
- `src/pages/CustomerInvoiceNew.tsx`
- `docs/CORRECAO_REENFILEIRAMENTO_APOS_CANCELAMENTO_MISMATCH.md`
