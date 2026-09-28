# Next Invoice Resolver Report — Sprint 4.1K

## Módulo

`src/lib/subscriptionNextInvoiceResolver.ts`

## API pública

| Função | Descrição |
|--------|-----------|
| `resolveNextInvoiceCandidate(detail, today?)` | Candidato completo com source e metadados |
| `getNextAwaitingGenerationCycle(detail, today?)` | Linha de timeline (ou projetada) |
| `hasFutureCyclesWithoutInvoice(detail, today?)` | `true` se há competência gerável |

## Algoritmo oficial

1. Coletar ciclos da timeline (excluir `lifecycle`)
2. Ordenar por `cycle_date` / `due_date` crescente
3. Ignorar cancelados e pagos
4. Ignorar ciclos com `invoice_id`
5. Selecionar o primeiro elegível
6. Se vazio: buscar `awaiting_generation` sem invoice
7. Se ainda vazio: **projetar** próximo vencimento via `advanceBillingDueYmd`

## Fontes

| Source | Quando |
|--------|--------|
| `timeline` | Linha existente na timeline |
| `cycles_raw` | Linha em `cycles_raw` |
| `projected` | Sintético a partir do contrato |

## Consumidores (obrigatório)

- `subscriptionNextInvoice.ts`
- `subscriptionRenewalRecovery.ts` (`findNextChargeTimelineRow`)
- `FinancialSummarySidebar.tsx`
- `NextInvoiceCard.tsx`

Nenhum outro módulo deve calcular próxima competência isoladamente.

_Sprint 4.1K_
