# Billing Calendar Certification — Sprint 4.2

## Objetivo

Calendário, Histórico, Timeline, Cycles, Invoices e Próxima cobrança representam o **mesmo estado** no banco.

## Backend

- `runSubscriptionCyclesReconciliation()` — cycles × jobs × invoices
- Assinaturas ativas sem `next_billing_date` válido

## Frontend (4.1L)

- `subscriptionFinancialEvents` — fonte única UI
- `subscriptionFinancialConsistencyAudit` — testes de paridade

## Módulo

`audit/calendar/calendarConsistency.ts`
