# Billing Health Score — Sprint 4.2A

## Visão geral

Pontuação **0–100** por domínio do billing, agregada em `billing_health_score`.

## Domínios

| Domínio | Fonte |
|---------|-------|
| `subscriptions` | `productionSubscriptions` |
| `worker` | `worker` |
| `scheduler` | derivado de `worker` |
| `runtime` | `productionSubscriptions` (peso reduzido) |
| `calendar` | `calendar` |
| `billing_plans` | `migration.metrics.missing_plan_count` |
| `billing_items` | `migration.metrics.missing_items_count` |
| `invoices` | `financial` |
| `cycles` | `calendar` |
| `timezone` | `timezone` |
| `performance` | `performance` |

## Penalidades

- Erro: −8 pontos (por issue)
- Warning: −2 pontos
- Módulo não certificado: cap em 85
- Cenários do auditor falhos: penalidade adicional

## Threshold

**≥ 99** para `deployment_ready: true`

## Artefatos

- `health-score.json`
- `production-health-score.json` (cópia para snapshot de produção)

## Exemplo

```json
{
  "billing_health_score": 100,
  "deployment_ready": true,
  "subscriptions": 100,
  "worker": 100,
  "scheduler": 100,
  "runtime": 100,
  "calendar": 100,
  "billing_plans": 100,
  "billing_items": 100,
  "invoices": 100,
  "cycles": 100,
  "timezone": 100,
  "performance": 100
}
```

## API interna

```typescript
import { computeBillingHealthScore } from './billingPlatform/audit';
```
