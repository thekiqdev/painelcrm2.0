# Billing — Geração Determinística por Ciclo (Sprint 4.2D)

## Problema

O comando **Gerar cobrança** inferia a competência a partir de `subscriptions.next_billing_date`. Isso ignorava ciclos anteriores sem fatura (competências puladas, recuperações legadas, geração antecipada fora de ordem).

## Solução

Geração manual passa a ser **determinística por `cycle_id`**:

```
subscription_id + cycle_id → subscription_cycles (exato) → job com cycle_key do ciclo → invoice
```

`next_billing_date` permanece apenas para **projeção** e **automação** (scheduler/worker). Não decide mais qual competência faturar no clique manual.

## API

`POST /api/crm-subscriptions/:id/manual-renew`

```json
{ "cycle_id": "uuid-do-ciclo" }
```

- Com `cycle_id`: fatura **exatamente** esse ciclo.
- Sem `cycle_id`: resolve o **ciclo mais antigo sem fatura** (`findEarliestUninvoicedCycle`), nunca `next_billing_date`.

## Backend

| Módulo | Responsabilidade |
|--------|------------------|
| `billingCycleInvoiceGenerationService.ts` | `generateInvoiceForCycle`, validação |
| `subscriptionCyclesQueryService.ts` | `getSubscriptionCycleById`, `findEarliestUninvoicedCycle` |
| `billingManualRenewalService.ts` | `ensureJobForManualGenerate({ cycleKey })` |

### Algoritmo

1. Receber `subscription_id` + `cycle_id` (opcional).
2. Resolver ciclo exato ou o mais antigo sem invoice.
3. Validar: existe, `invoice_id IS NULL`, status elegível.
4. Enfileirar job com `cycle_key = cycle.cycle_date` (não recalcular competência).
5. Executar pipeline síncrono existente (sem alterar billing engine/worker).
6. Após sucesso, `advanceSubscriptionAfterCompletedCycle` (comportamento existente).

## Frontend

Todos os botões **Gerar cobrança** enviam `cycle_id` quando disponível:

- Próxima cobrança (`NextInvoiceCard`)
- Histórico (`FinancialHistoryRow` → `row.cycleId`)
- Calendário (`FinancialCalendarPopover` → `ev.cycleId`)
- Sidebar / alertas (`nextInvoice.cycleId`)

Tipo compartilhado: `src/lib/subscriptionBillingGeneration.ts`.

## Regras

- Nunca gerar competência diferente da clicada.
- Nunca ignorar ciclo sem invoice quando explicitamente solicitado.
- Nunca usar `next_billing_date` para decidir competência manual.
- O ciclo (`subscription_cycles`) é a fonte oficial para geração manual.

## Testes

- `billingCycleInvoiceGenerationService.test.ts`
- `billingManualRenewalExecution.test.ts` (mock de ciclos)
