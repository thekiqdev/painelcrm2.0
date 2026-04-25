# Correção definitiva — avanço de `subscriptions.next_billing_date` após ciclo recorrente

**Data:** 2026-04-24  
**Código:** `packages/backend/src/services/recurringBillingJobService.ts`

## Causa raiz (hipótese principal)

O avanço usava `mergeNextBillingAfterCompletedCycle` com **`subscription.next_billing_date` lido no início do processamento do job** (`getSubscriptionById` antes de criar fatura / efeitos laterais). Em cenários de:

- alteração concorrente da assinatura,
- re-leitura desalinhada, ou
- qualquer diferença entre o valor “em memória” e o valor **atual** na linha `subscriptions`,

a decisão de merge podia **não refletir o estado real** do banco. A correção **centraliza** o avanço numa única função que:

1. Faz **`SELECT … FOR UPDATE`** em `subscriptions` **no momento do avanço** (leitura fresca + lock por assinatura).
2. Calcula o próximo ciclo apenas com **`cycle_date` (job / ciclo processado) + `billing_interval`**, via `nextSubscriptionBillingAfterCycle` → `calculateNextBillingDate(..., null)` (sem `due_date`, `CURRENT_DATE`, `now()`, sem âncora antiga no avanço).

## Caminhos que passam a usar o mesmo avanço

| Origem | `source` (log) |
|--------|----------------|
| CRM — nova `customer_invoice` | `crm_new_invoice` |
| CRM — fatura existente (idempotente) | `crm_idempotent_invoice` |
| CRM — sem itens elegíveis (ciclo concluído sem nova fatura) | `crm_no_eligible_items` |
| SaaS — nova `tenant_billing` | `saas_new_invoice` |
| SaaS — fatura existente (idempotente) | `saas_idempotent_invoice` |

Em todos: **`advanceSubscriptionAfterCompletedCycle`** → **`updateSubscriptionAfterRenewal`** (atualiza também `current_period_*`, `billing_cycle_count`, `billing_anchor_day` a partir do novo `next_billing_date`, `last_job_at`).

**`completeBillingRecurringJob`** continua **após** o avanço (dual-write em `subscription_cycles` no complete, sem alterar `next_billing_date`).

## Regra final (decisão pura)

Função exportada para testes: **`computeFinalNextBillingForCompletedCycle`**.

- `computedNextYmd = nextSubscriptionBillingAfterCycle(cycleDate, interval)`.
- Se `old_next` inválido → `final = computed`.
- Se `old_next <= cycleDate` → `final = computed` (caso normal: next ainda é o ciclo que acabou de ser processado).
- Se `old_next > cycleDate` → `final = max(computed, old_next)` (anti-regressão).
- `skippedAlreadyAhead` quando `final === old` e `old > computed` (assinatura já estava adiantada além do cálculo do ciclo).

## Logs obrigatórios (`billingLog`)

| `message` | Quando |
|-----------|--------|
| `subscription_cycle_advance_check` | Antes da decisão; inclui `old_next_billing_date`, `computed_next_billing_date`, `cycle_date`, `source`, `invoice_id` (se houver). |
| `subscription_cycle_advance_skipped_already_ahead` | Decisão anti-regressão (`skippedAlreadyAhead`). |
| `subscription_cycle_advance_applied` | Antes do `UPDATE`; inclui `final_next_billing_date`, `billing_cycle_count`, `reason`. |

## O que **não** avança (inalterado)

- Job **failed** / **retry** (`retry_at` futuro).
- Job **cancelled** (mismatch, não ativa, etc.).
- **Requeue** só por janela horária — sem conclusão do ciclo.

### Skipped do scheduler (`skipped_completed_cycle`)

- **Não** é caminho de worker: o scheduler **não** atualiza assinatura. Se existir inconsistência histórica (job `completed` mas `next_billing_date` nunca avançou), continua a exigir **correção operacional/dados** (ver `docs/INVESTIGACAO_TOTAL_MODELO_FATURAS_RECORRENTES.md`).

## Testes automatizados

Ficheiro: `packages/backend/src/services/recurringBillingJobService.advance.test.ts` (Vitest).

- Mensal 24/04 → 24/05 com `old_next = 24/04`.
- Anual.
- Anti-regressão (`old_next` já em 06/24).
- `old_next` já em 05/24 com ciclo 04/24.

Comando: `cd packages/backend && npm test`

## `subscription_cycles`

- Continua a ser atualizado em **`completeBillingRecurringJob`** / dual-write (quando a flag de escrita está ativa).
- O avanço da assinatura **não** depende de `subscription_cycles`; a coerência esperada é: ciclo do job fica `invoiced` (ou equivalente) e `subscriptions.next_billing_date` reflete o **próximo** ciclo lógico.

## Riscos remanescentes

- **Ordenação de locks:** `FOR UPDATE` na assinatura reduz corridas entre workers na mesma assinatura; outros fluxos que atualizem `subscriptions` sem passar pelo mesmo lock podem ainda competir (fora do âmbito desta correção).
- **Estado legado:** assinaturas com job `completed` e `next_billing_date` desalinhado continuam a precisar de reconciliação manual ou script.

## Referências

- `docs/INVESTIGACAO_TOTAL_MODELO_FATURAS_RECORRENTES.md`
- `docs/SUBSCRIPTION_CYCLES_PHASE3.md`
