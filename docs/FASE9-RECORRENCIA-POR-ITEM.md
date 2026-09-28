# Fase 9 — Recorrência por item controlada

**Objetivo:** formalizar regras de negócio e operação (flags, idempotência, observabilidade) sobre o motor já existente (`subscriptions` type=`customer`, worker, E2).

## Regras D3 / D5 / E1 / E2

| Ref | Regra |
|-----|--------|
| **D3** | Cada **ciclo** da assinatura (`next_billing_date`) pode gerar uma nova `customer_invoice` de tipo `recurring` com itens copiados da fatura anterior **compatíveis** com o ciclo. Itens com **data própria** (`scheduled_due_date` ≠ início do ciclo na fatura pai) **não** entram nesse lote — são tratados por **E2**. |
| **D5** | Na renovação, só entram itens com **`is_recurring = true`**. Itens não recorrentes **não** são copiados para a próxima fatura de ciclo (comportamento “fatura mista”: linhas avulsas morrem no ciclo atual salvo nova emissão manual). |
| **E1** | `scheduled_due_date` + `recurring_interval` definem a agenda por linha; o worker **avança** `scheduled_due_date` após inclusão em fatura (ciclo ou filha). |
| **E2** | Se `scheduled_due_date` está definido e **diferente** do `period_start` da fatura pai (ou do `due_date` se não houver período), a cobrança é uma **fatura filha** (`invoice_type = child`, FK `parent_invoice_item_id`), gerada por `processChildItemDueInvoices`, com idempotência **`(parent_invoice_item_id, due_date)`**. Na renovação de ciclo, itens com `scheduled_due_date !== periodStart` são **excluídos** do lote (só E2). |

## Idempotência (já no schema / código)

- Ciclo: índice único parcial `(subscription_id, period_start)` com `parent_invoice_id IS NULL`.
- Filha E2: índice único parcial `(parent_invoice_item_id, due_date)`.
- Cobrança gateway filha: `idempotency_key = customer_child_{itemId}_{dueDate}`.

## Feature flags (Fase 9)

| Variável | Default | Efeito |
|----------|---------|--------|
| `BILLING_CHILD_ITEM_INVOICES_ENABLED` | *(ligado)* | Se `false`, **não** executa `processChildItemDueInvoices` (E2 desligado sem novo deploy de lógica). |
| `BILLING_CHILD_BATCH_LIMIT` | `50` | Máximo de linhas candidatas por execução do worker (cap **200**). |

Ver `docs/ENV-BILLING.md`.

## Observabilidade

- Logs JSON `[BILLING]` via `billingLog`: `child_invoices_feature_off`, `child_batch_summary` (created, skipped, errors, candidates, batchLimit), erros de insert/cobrança.
- Saída do script `runRecurringWorker.ts`: `child_invoices_e2` no objeto final.

## Referências de código

- `packages/backend/src/config/billingEnv.ts`
- `packages/backend/src/services/recurringBillingJobService.ts` — `processOneCustomerRenewalJob`, `processChildItemDueInvoices`
- `packages/backend/src/scripts/runRecurringWorker.ts`
