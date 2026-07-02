# Billing Engine 3.0 — Final Architecture Audit (Sprint 3.2A)

**Data:** 2026-06-26  
**Modo:** READ ONLY — nenhuma alteração funcional  
**Auditor:** Varredura automatizada + revisão estática do repositório

---

## BillingFinalArchitectureAudit

```yaml
engine_version: v3_billing_engine_ga
overall_score: 100
approved: true
verdict: FINAL_ARCHITECTURE_APPROVED
core_question_motor_legado_crm: NÃO
```

> **Update (Sprint 3.2B):** Housekeeping complete — see [BILLING_FINAL_GA_REPORT.md](./BILLING_FINAL_GA_REPORT.md).

### Resposta objetiva

> **Existe qualquer resquício do motor legado CRM (invoice-copy renewal) no hot path de produção?**

**NÃO.** O Worker CRM executa exclusivamente `executeWorkerCrmRenewal` → `BillingExecutionContextBuilder` → `BillingEngine` → `BillingExecutionOrchestrator`. Os módulos `executeCustomerRenewal`, `crmRenewalCustomerResolver` e `crmSubscriptionContractRenewalOverlay` foram removidos e não possuem callers em código de produção.

A aprovação formal **não** foi concedida porque critérios adicionais de GA (namespace, flags de migração, infraestrutura shadow/cutover, nomenclatura observability) ainda apresentam resíduos documentados abaixo — **sem impacto no motor CRM em produção**, mas fora do Definition of Done estrito desta sprint.

---

## Resumo por área

| Área | Score | Status | Notas |
|------|-------|--------|-------|
| legacy_symbols | 10/10 | ✅ PASS | 0 símbolos proibidos em `.ts` de produção (exceto guard intencional) |
| legacy_modules | 10/10 | ✅ PASS | Arquivos removidos; diretórios renomeados |
| namespace | 6/10 | ⚠️ PARTIAL | Logs/API ainda usam sufixo `V2` / `PersistenceOrchestrator` |
| feature_flags | 4/10 | ❌ FAIL | `BILLING_PLAN_V2` / `BILLING_PLAN_V2_SHADOW` ativos |
| dead_code | 7/10 | ⚠️ PARTIAL | Scripts e módulos de migração órfãos |
| database | 7/10 | ⚠️ PARTIAL | `legacy_invoice_copy` ainda no CHECK SQL |
| documentation | 6/10 | ⚠️ PARTIAL | 33 docs históricos V1/V2; 4 docs operacionais 3.0 |
| observability | 6/10 | ⚠️ PARTIAL | Tags `BILLING_ENGINE_V2`, stage `PersistenceOrchestrator` |
| tests | 9/10 | ✅ PASS | 307+ testes core; guards de remoção ativos |
| dependency_graph | 10/10 | ✅ PASS | Único pipeline CRM documentado e verificado |
| build | 10/10 | ✅ PASS | `tsc` limpo |
| api | 7/10 | ⚠️ PARTIAL | Endpoints de migração superadmin ainda expostos |

---

## 1. Legacy Symbol Audit

### Produção (`packages/backend/src/**/*.ts`, excl. `*.test.ts`)

| Símbolo | Ocorrências | Veredito |
|---------|-------------|----------|
| `executeCustomerRenewal` | 0 | ✅ |
| `resolveCrmRenewalPreviousInvoice` | 0 | ✅ |
| `crmSubscriptionContractRenewalOverlay` | 0 | ✅ |
| `buildBillingItemsFromInvoice` | 0 | ✅ |
| `overlayCrmContractOnRenewalItems` | 0 | ✅ |
| `crmRenewalCustomerResolver` | 0 | ✅ |
| `BillingEngineV2` | 0 | ✅ |
| `BillingPersistenceOrchestrator` | 0 | ✅ |
| `billingEngineV2/` | 0 | ✅ |
| `billingPersistence/` | 0 | ✅ |
| `legacy_invoice_copy` | 1 | ⚠️ `deprecatedBillingStrategies.ts` (rejeição intencional) |
| `virtual_from_invoice_template` | 1 | ⚠️ `deprecatedBillingStrategies.ts` (detecção) |
| `virtual_from_subscription` | 0 | ✅ |
| `invoice.template_resolvable` | 1 | ⚠️ `renewalDiagnosisService.ts` (campo `@deprecated`, espelha `billing_plan`) |

### Testes

Símbolos proibidos aparecem apenas em listas de negação (`legacyRemovalVerification.test.ts`, `billingEngine.test.ts`, `workerCrmRenewalPipeline.test.ts`, etc.) — **aceitável**.

### Frontend (`src/`)

Nenhuma referência aos símbolos legados.

### Scripts

| Arquivo | Status |
|---------|--------|
| `packages/backend/scripts/build-executeCustomerRenewal.mjs` | ❌ Órfão — referencia módulo removido |

---

## 2. Namespace Audit

### Produção — aliases V2 removidos como tipos/módulos

✅ `BillingEngine`, `billingEngine/`, `BillingExecutionOrchestrator`, `billingExecution/`

### Resíduos de nomenclatura V2 (não funcionais, mas presentes)

| Local | Exemplo |
|-------|---------|
| `billingEngine/engineLogger.ts` | Log tag `[BILLING_ENGINE_V2]` |
| `workerV2Logger.ts` | Tags `WORKER_ENGINE_V2`, `WORKER_PERSISTENCE` |
| `billingObservability/types.ts` | Stage `PersistenceOrchestrator`, version `v2_observability_*` |
| `billingExecution/orchestratorLogger.ts` | `logPersistenceOrchestrator`, `PERSISTENCE_ORCHESTRATOR` |
| `superadminRoutes.ts` | `GET /billing/v2-observability` |
| `billingEngine/billingEnginePipeline.ts` | metadata `engine: 'billing_engine_v2'` |

**Resultado:** namespaces de código consolidados; **rótulos operacionais ainda dizem V2**.

---

## 3. Feature Flag Audit

| Flag | Arquivo | Uso atual | Classificação |
|------|---------|-----------|---------------|
| `BILLING_PLAN_V2` | `config/billingEnv.ts` | Metadata em context; `billingPlanProvider` | ⚠️ Migração |
| `BILLING_PLAN_V2_SHADOW` | `config/billingEnv.ts` | Shadow após renovação no worker | ⚠️ Migração |

**Nota:** CRM renewal **não** consulta `resolveBillingPlanReadProvider()` (exportado mas sem callers fora de testes). O hot path ignora a flag para execução; shadow ainda roda pós-job quando `BILLING_PLAN_V2_SHADOW=true`.

**Resultado:** ❌ Flags de migração ainda presentes.

---

## 4–12. Referências cruzadas

Detalhamento completo nos artefatos dedicados:

- [BILLING_DEAD_CODE_REPORT.md](./BILLING_DEAD_CODE_REPORT.md)
- [BILLING_DOCUMENTATION_AUDIT.md](./BILLING_DOCUMENTATION_AUDIT.md)
- [BILLING_FEATURE_FLAG_AUDIT.md](./BILLING_FEATURE_FLAG_AUDIT.md)
- [BILLING_DATABASE_AUDIT.md](./BILLING_DATABASE_AUDIT.md)
- [BILLING_DEPENDENCY_GRAPH_FINAL.md](./BILLING_DEPENDENCY_GRAPH_FINAL.md)
- [BILLING_PUBLIC_API_REPORT.md](./BILLING_PUBLIC_API_REPORT.md)

---

## 10. Dependency Graph — CRM produção

```
Worker (recurringBillingJobService.processNextBatch)
  → executeWorkerCrmRenewal
    → BillingExecutionContextBuilder
      → resolvePlanAndItems (somente billing_plans + billing_plan_items)
    → BillingEngine.execute
    → BillingExecutionOrchestrator.execute
      → Invoice / Items persistence
      → Gateway
      → Notifications
      → Timeline
      → History
      → Subscription advance
```

**Nenhuma seta passa por `executeCustomerRenewal` ou resolvers de invoice template.**

Opcional (não produz invoice): `runBillingShadowComparison` após job CRM quando shadow flag ativa.

---

## 12. Architecture Consistency

| Pergunta | Resposta |
|----------|----------|
| Existe mais de uma forma de gerar invoice CRM em produção? | **NÃO** |
| Existe mais de uma fonte de verdade para renovação CRM? | **NÃO** (`billing_plans` + `billing_plan_items`) |
| Existe fallback oculto no hot path? | **NÃO** |
| Existe resolver legado no context builder? | **NÃO** |
| Existe duplicação de regra de negócio? | **NÃO** (engine delega projection calculators) |
| Existe cálculo duplicado divergente? | **NÃO** (mesma pipeline de projeção) |
| Existe pipeline paralelo? | **SIM** — shadow comparison opcional pós-renovação (observabilidade, não emite fatura) |

---

## Critérios de aprovação

| Critério | Resultado |
|----------|-----------|
| Zero símbolos legados em produção | ✅ (com exceção guard `deprecatedBillingStrategies`) |
| Zero namespace V2 | ❌ (logs, API, observability) |
| Zero feature flags temporárias | ❌ |
| Zero fallback legado CRM | ✅ |
| Zero pipeline paralelo | ❌ (shadow opcional) |
| Zero código morto relevante | ⚠️ |
| Dependency Graph único (CRM) | ✅ |
| Build limpo | ✅ |
| Testes passando | ✅ |

---

## recommendation

**Motor legado CRM:** encerrado com sucesso — seguro operar Billing Engine 3.0 como arquitetura única de renovação CRM.

**GA formal (Sprint 3.2A strict):** adiar até Sprint de housekeeping:

1. Remover ou arquivar `BILLING_PLAN_V2*` env flags e wiring shadow no worker
2. Renomear tags de log/observability (`BILLING_ENGINE`, `BillingExecution`, `/billing/observability`)
3. Remover `packages/backend/scripts/build-executeCustomerRenewal.mjs`
4. Avaliar deprecação de módulos `billingShadow/`, `billingCutover/`, `billingMigration*` (superadmin only)
5. Migration SQL futura: retirar `legacy_invoice_copy` do DEFAULT/CHECK
6. Remover campo `invoice.template_resolvable` da API de diagnóstico (breaking API menor)

**Veredito:** `FINAL_ARCHITECTURE_NOT_APPROVED` — bloqueios são **dívida de nomenclatura e infraestrutura de migração**, não reativação do motor legado.

---

## Verificação executada

```
npm run build          → OK
vitest legacyRemoval   → 21/21 OK
vitest billing core    → 307/307 OK
```
