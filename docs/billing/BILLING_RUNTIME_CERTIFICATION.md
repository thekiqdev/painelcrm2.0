# Billing Runtime Certification — Sprint 4.1J

## Status oficial: **RUNTIME CERTIFIED**

| Cenário | Mecanismo | Status |
|---------|-----------|--------|
| Gerar primeira cobrança | manual + engine | ✓ |
| Gerar antecipada | `assessManualGenerateUnblocked` | ✓ |
| Gerar antecipada múltiplas | sem bloqueio worker | ✓ |
| Alterar vencimento | `patchSubscriptionBillingDates` + guard | ✓ |
| Upgrade / downgrade | contract service | ✓ |
| Pausa / retomada | lifecycle service | ✓ |
| Worker | unified pipeline | ✓ |
| Retry | re-pick unified | ✓ |
| Cron / Scheduler | enqueue → worker | ✓ |
| Payment manual | invoice admin | ✓ |
| Payment gateway | gateway service (não alterado) | ✓ |
| Invoice | execution persistence (não alterado) | ✓ |
| Billing plan | provision + repair | ✓ |
| Provisioning | `repairBillingPlanForSubscription` | ✓ |
| Repair | `validateBillingRuntime` | ✓ |
| Synchronization | `billingPlanSynchronizationService` | ✓ |

## Testes automáticos

- `billingRuntimeAssertions.test.ts` — root cause Tue Jun 30
- `billingCycleKey.test.ts` — normalização
- `subscriptionCycleRepairService.test.ts` — repair
- `renewalRecoveryCompletion.test.ts` — UX + readiness

## Artefatos

- `storage/debug/billing-runtime/runtime-*.json` — trace SQL
- `storage/debug/billing-runtime/billing-cycle-consistency.json` — auditoria ciclos

_Sprint 4.1J_
