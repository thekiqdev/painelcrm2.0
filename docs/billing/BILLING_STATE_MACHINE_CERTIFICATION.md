# Billing State Machine Certification — Sprint 4.2C

## Gate

`billing-state-machine-report.json` → `certified: true`

## Métricas

| Métrica | Esperado |
|---------|----------|
| `invalid_cancelled_without_invoice` | 0 |
| `nan_date_sources` | 0 |
| `skipped_normalized` | ≥ 0 (informativo) |
| `future_cycles_recovered` | ≥ 0 (informativo) |
| `hidden_generate_buttons` | 0 |
| `financial_event_corrections` | informativo |

## Assertions de runtime (frontend)

`assertBillingStateMachine()` valida:

- Nenhum ciclo Cancelado sem invoice em assinatura ativa
- Nenhum `invoice_cancelled` sem `invoiceId`
- Assinatura ativa com competência futura (`upcoming_cycle`)
- Nenhuma data NaN nos eventos

## Integração certificação 4.2A

`billing:production-validation` inclui módulo `billingStateMachine` e flag `state_machine_certified` no certificado final.

## Definition of Done

- [x] State Machine única (`billingStateMachine.ts`)
- [x] Skipped → Prevista quando recuperável
- [x] `invoice_cancelled` apenas com invoice
- [x] Histórico/Calendário/Sidebar paridade via `FinancialEventStore`
- [x] Datas NaN bloqueadas
- [x] Sem alteração em Engine, Worker, Scheduler, Gateway ou schema DB
