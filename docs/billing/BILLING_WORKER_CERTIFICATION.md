# Billing Worker Certification — Sprint 4.1J

## Status: CERTIFIED

Todos os caminhos abaixo utilizam o **mesmo pipeline** (`executeRenewalJobSynchronously` → `BillingRenewalEngine`).

| Caminho | Entry | Pipeline | Certificado |
|---------|-------|----------|-------------|
| Generate Now | `manualGenerateRenewalNow` | unified | ✓ |
| Retry manual | `manualReprocessRenewal` | unified | ✓ |
| Retry automático | worker re-pick pending | unified | ✓ |
| Worker | `pickAndExecuteRenewalJob` | unified | ✓ |
| Cron / Scheduler | `enqueueDueRenewals` | enqueue only → worker | ✓ |
| Advance Cycle | `advanceSubscriptionAfterCompletedCycle` | post-complete | ✓ |
| Alterar vencimento | `patchSubscriptionBillingDates` | subscription update | ✓ |

## Forks eliminados

- Geração manual **não** usa scheduler
- Worker **não** monta SQL com `Date` cru
- Dual-write cycles **normaliza** antes de `::date`

## Date guard

Todo `pool.query` com tabelas billing passa por `guardBillingQueryParams()`.

## Assertions

`assertBillingDate` bloqueia `"Tue Jun 30"` antes do PostgreSQL.

_Sprint 4.1J — RUNTIME CERTIFIED_
