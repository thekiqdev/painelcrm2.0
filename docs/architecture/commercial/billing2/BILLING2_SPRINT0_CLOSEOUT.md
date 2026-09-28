# Billing 2.0 — Sprint 0 Closeout

| Campo | Valor |
|-------|-------|
| **Sprint** | 0 — Preparação |
| **Data** | 2026-07-27 |
| **Status** | Implementada — aguardando aprovação QA / product |

## Entregáveis

| Item | Status |
|------|--------|
| Inventário Feature Flags (PRD §18 + técnicas) | ✅ |
| Runtime leitura (defaults + env) | ✅ |
| API `GET /api/superadmin/billing/feature-flags` | ✅ |
| UI inventário flags | ✅ |
| Hub / nav Financeiro + placeholders | ✅ |
| Correlation ID helpers + doc | ✅ |
| Template PR/QA §17 | ✅ |
| Spike Asaas (discovery) | ✅ |
| Migrations | ❌ não (escopo) |
| Consumo em renovação/checkout | ❌ não (escopo) |

## Critérios de aceite

- [x] Flags default: destrutivas OFF
- [x] `consumed_by_billing_runtime: false`
- [x] Sem migration destrutiva
- [ ] QA manual: checkout / renovação / saas-pay / hub (operador)

## Rollback

Revert dos PRs desta sprint; sem dados novos obrigatórios.
