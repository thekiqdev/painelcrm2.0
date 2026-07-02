# Next Invoice Certification — Sprint 4.1K

## Status: CERTIFIED

| Cenário | Teste | Status |
|---------|-------|--------|
| 1 geração antecipada | `subscriptionNextInvoiceResolver.test.ts` | ✓ |
| 2 consecutivas | `simulateConsecutiveGenerations(2)` | ✓ |
| 5 consecutivas | `simulateConsecutiveGenerations(5)` | ✓ |
| 10 consecutivas | `simulateConsecutiveGenerations(10)` | ✓ |
| 20 consecutivas | `simulateConsecutiveGenerations(20)` | ✓ |
| Promoção pós-invoice | `resolveNextInvoiceExperience integration` | ✓ |
| Projeção sem linha futura | `projects next week` | ✓ |

## Assertions

- ✓ Nenhum ciclo duplicado no card
- ✓ Nenhum ciclo perdido na projeção
- ✓ `hasInvoice === false` após faturar ciclo anterior
- ✓ `dueYmd` avança semanalmente (`advanceBillingDueYmd`)
- ✓ Store invalida com `latest_invoice_id`

## Definition of Done

- ✓ Próxima competência após geração manual
- ✓ Fluxo de antecipação infinito
- ✓ Sem refresh manual (F5)
- ✓ Histórico/calendário/KPIs/sidebar via `FinancialEventStoreProvider`

_Sprint 4.1K — Infinite Next Invoice Pipeline CERTIFIED_
