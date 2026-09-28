# Billing Production Validation — Sprint 4.2A

## Objetivo

Validar que o sistema de auditoria da Sprint 4.2 **detecta problemas reais**, **executa reparos automáticos** quando aplicável e **certifica o ambiente** para produção.

Esta sprint **não altera** Billing Engine, Execution, Gateway, Scheduler, Worker ou UX.

## Comando

```bash
cd packages/backend
npm run billing:production-validation
```

Opções:

| Flag | Descrição |
|------|-----------|
| `--dry-run` | Auditoria sem reparos |
| `--tenant=<uuid>` | Limitar a um tenant |
| `--limit=N` | Máximo de assinaturas auditadas (default 5000) |

## Fluxo

1. **Sprint 4.2** — `runProductionReadinessCertification` (7 módulos paralelos)
2. **Cenários do auditor** — 9 injeções propositais validadas sinteticamente
3. **Health Score** — pontuação 0–100 por domínio
4. **Stress** — datasets 100 / 1000 / 5000 + invariantes
5. **Certificado** — `PRODUCTION READY` ou `NOT READY`

## Cenários validados

| Cenário | Detecção | Reparo automático |
|---------|----------|-------------------|
| Missing Billing Plan | `missing_billing_plan` | `repairBillingPlanForSubscription` |
| Missing Billing Items | `plan_without_items` | Provisionamento de itens |
| Missing Next Billing Date | `missing_next_billing_date` | Runtime validator |
| Duplicated Cycles | `duplicate_cycle` | Detecção (reparo manual) |
| Invoice Orphan | `orphan_subscription_invoices` | Relatório |
| Worker Processing Forever | `stuck_processing_jobs` | `stuck_retry_reset` |
| Recoverable Failed Cycle | `recoverable_failed_with_invoice` | `cycles_failed_to_pending` |
| Timezone | Matriz SP/UTC/boundaries | N/A |
| Financial Integrity | MRR + paridade | N/A |

## Artefatos JSON

Gerados em `storage/debug/billing-production/`:

- `production-validation.json`
- `auditor-certification.json`
- `health-score.json`
- `production-health-score.json`
- `deployment-certification.json`
- `production-certification.json`
- `production-ready-snapshot.json`

Mais os 8 artefatos da Sprint 4.2.

## Critério de aprovação

- 100% dos cenários detectados
- 100% dos reparos mapeados
- 0 falsos positivos / negativos
- Health Score **≥ 99**
- Certificados: **AUDITOR CERTIFIED** + **PRODUCTION READY**

## Feature Freeze

Após aprovação desta sprint, o módulo Billing/Assinaturas entra em **congelamento funcional** — apenas correções críticas mediante nova certificação.
