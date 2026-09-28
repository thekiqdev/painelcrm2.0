# Billing Platform — Production Readiness (Sprint 4.2)

## Status oficial

Executar:

```bash
cd packages/backend && npm run billing:production-cert
```

| Campo | Valor quando verde |
|-------|-------------------|
| `status` | `PRODUCTION READY` |
| `deployment_approved` | `true` |
| `expected_final_status.deployment` | `APPROVED` |

## Módulos

| Módulo | Artefato JSON |
|--------|----------------|
| Assinaturas | `production-subscription-audit.json` |
| Worker | `worker-certification.json` |
| Financeiro | `financial-certification.json` |
| Migração | `migration-certification.json` |
| Calendário | `calendar-consistency.json` |
| Performance | `performance-certification.json` |
| Timezone | `timezone-certification.json` |
| Resumo | `production-readiness-summary.json` |

**Diretório:** `storage/debug/billing-production/`

## Regras

- Sem alteração de UX, Billing Engine, Execution, Gateway, Scheduler ou Worker Architecture.
- Reparo automático via `validateBillingRuntime` (4.1J) e `repairBillingPlanForSubscription` (4.0A).
- `--dry-run` desliga reparos; `--tenant=<uuid>` limita escopo; `--limit=N` limita assinaturas.

## Certificados pré-requisito

- Billing Runtime 4.1J
- Billing Worker 4.1J
- Financial Experience 4.1L
- Payment Confirmation 4.1M
