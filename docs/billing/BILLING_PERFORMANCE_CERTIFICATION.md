# Billing Performance Certification — Sprint 4.2

## Datasets medidos

| Alvo | Query |
|------|-------|
| 100 / 1000 / 5000 assinaturas | `SELECT … LIMIT N` |
| Amostra audit | `validateBillingRuntime` (1 sub) |

## Contagens reais

- Total subscriptions (customer)
- Total invoices (subscription)
- Total subscription_cycles

## Limites

- Listagem > 30s → warning
- Audit single sub > 15s → warning

## Módulo

`audit/performance/performanceCertification.ts`
