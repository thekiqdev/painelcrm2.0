# Billing Engine 3.0 — Public API Report

**Data:** 2026-06-26

---

## Pacotes oficiais (exports `index.ts`)

| Pacote | Export principal | Versão |
|--------|------------------|--------|
| `billingEngine/` | `BillingEngine`, `BILLING_ENGINE_VERSION` | `v3_billing_engine_ga` |
| `billingExecution/` | `BillingExecutionOrchestrator`, `EXECUTION_ORCHESTRATOR_VERSION` | `v3_execution_orchestrator_ga` |
| `billingExecutionContext/` | `billingExecutionContextBuilder`, `resolvePlanAndItems` | — |
| `billingObservability/` | `getBillingObservabilityReport`, metrics/health | `v2_observability_sprint_3_1a` ⚠️ |
| `services/workerCrmRenewalPipeline/` | `executeWorkerCrmRenewal` | `v3_worker_crm_sprint_3_1` ⚠️ |

### Exports proibidos — ausentes ✅

- `BillingEngineV2`
- `billingPersistence`
- `BillingPersistenceOrchestrator`
- `executeCustomerRenewal`
- `legacy` / `migration` como namespace público

---

## Pacotes de migração ainda exportados (superadmin / tooling)

| Pacote | Propósito | GA status |
|--------|-----------|-----------|
| `billingShadow/` | Comparação shadow + `normalizeLegacyRenewal` | ⚠️ Migração |
| `billingCutover/` | Decisão de cutover | ⚠️ Migração |
| `billingMigrationReadiness/` | Readiness reports | ⚠️ Migração |
| `billingMigrationSimulator/` | Simulação rollback | ⚠️ Migração |
| `billingPipelineCertification/` | Certificação V1 vs V2 | ⚠️ Histórico |
| `billingCertification/` | Suite certificação | ⚠️ Histórico |
| `billingCertificationLab/` | Lab/regression | ⚠️ Dev only |
| `billingProjection/` | Projeção READ ONLY | ✅ Suporte engine |
| `services/billingRenewalEngine/` | SaaS + guard CRM | ✅ SaaS only |

---

## HTTP — Superadmin billing routes

| Rota | Classificação | GA |
|------|---------------|-----|
| `GET /billing/v2-observability` | Operacional | ⚠️ nome V2 |
| `GET /billing/shadow-report/:id` | Diagnóstico migração | ⚠️ |
| `GET /billing/projection/:id` | Diagnóstico | ✅ |
| `POST /billing/projection/:id/compare` | Diagnóstico | ✅ |
| `GET /billing/migration-readiness*` | Migração | ⚠️ |
| `GET /billing/migration-simulator*` | Migração | ⚠️ |
| `GET /billing/cutover*` | Migração | ⚠️ |
| `GET /billing/certification*` | Certificação histórica | ⚠️ |

Nenhuma rota expõe `executeCustomerRenewal` ou motor legado.

---

## Diagnóstico operacional (tenant)

| API / Service | Campo legado | Status |
|---------------|--------------|--------|
| `renewalDiagnosisService` | `invoice.template_resolvable` | `@deprecated` — espelha `billing_plan.present` |
| `renewalDiagnosisService` | `billing_plan` | ✅ Canônico |

---

## Recomendações (sem implementar nesta sprint)

1. Renomear rota observability → `/billing/observability`
2. Marcar rotas cutover/shadow/certification como `deprecated` na documentação OpenAPI
3. Atualizar `BILLING_OBSERVABILITY_VERSION` para `v3_*`
4. Remover export público de `LegacySubscriptionProvider` quando flags forem retiradas
