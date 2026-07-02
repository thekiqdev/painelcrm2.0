# Billing Engine 3.0 — Dead Code Report

**Data:** 2026-06-26  
**Modo:** Inventário read-only

---

## Alta confiança — pode remover (Sprint futura)

| Arquivo / Módulo | Motivo | Pode remover? |
|------------------|--------|---------------|
| `packages/backend/scripts/build-executeCustomerRenewal.mjs` | Codegen do módulo removido | ✅ Sim |
| `billingPlan/billingPlanProvider.ts` (`LegacySubscriptionProvider`, `resolveBillingPlanReadProvider`) | Zero callers em produção; só testes + export | ✅ Sim (após remover flags) |
| `billingShadow/legacyRenewalNormalizer.ts` | Normaliza motor V1 para shadow; CRM não usa V1 | ⚠️ Sim, se shadow desligado |
| `billingCutover/*` | Cutover concluído (Worker 3.1) | ⚠️ Sim, se superadmin não precisar |
| `billingMigrationReadiness/*` | Readiness pré-migração | ⚠️ Sim |
| `billingMigrationSimulator/*` | Simulador pré-cutover | ⚠️ Sim |
| `billingPipelineCertification/*` | Certificação V1 vs V2 one-shot | ⚠️ Arquivar |
| `billingCertification/*` + `billingCertificationLab/*` | Suite histórica | ⚠️ Manter só em CI lab |

---

## Wiring ativo mas não-crítico

| Local | Motivo | Pode remover? |
|-------|--------|---------------|
| `recurringBillingJobService.ts` L1836–1845 | `runBillingShadowComparison` pós-CRM | ⚠️ Sim, com flag shadow |
| `recurringBillingJobService.ts` L1776–1784 | Shadow pós-SaaS | ⚠️ Independente do CRM |
| `billingEngineHealthService.ts` | Agrega stats cutover/shadow/readiness | ⚠️ Após remover módulos |

---

## Imports / exports sem callers diretos

| Símbolo | Exportado em | Callers produção |
|---------|--------------|------------------|
| `resolveBillingPlanReadProvider` | `billingPlan/index.ts` | 0 |
| `LegacySubscriptionProvider` | `billingPlan/index.ts` | 0 |
| `BillingPlanProviderV2` | `billingPlan/index.ts` | 0 (stub `not_implemented`) |

---

## Testes com fixtures legadas

| Arquivo | Motivo | Pode remover? |
|---------|--------|---------------|
| `renewalManualReadiness.test.ts` | Usa `template_resolvable: 'exact'` | ⚠️ Atualizar para `billing_plan` |
| `billingShadow/*.test.ts` | Cobre normalizer V1 | ⚠️ Com módulo shadow |
| `billingCutover/*.test.ts` | Política cutover | ⚠️ Com módulo cutover |

---

## Não é dead code

| Item | Razão |
|------|-------|
| `deprecatedBillingStrategies.ts` | Guard ativo — rejeita rows DB legadas |
| `crmContractMetadata.ts` | Contrato CRM + sync faturas abertas |
| `BillingRenewalEngine` | SaaS + guard CRM |
| `billingProjection/` | Usado por engine e APIs diagnóstico |

---

## Resumo

| Categoria | Itens | Impacto se removido |
|-----------|-------|---------------------|
| Órfão confirmado | 1 script | Nenhum |
| Export sem caller | 1 arquivo provider | Nenhum em produção |
| Infra migração | ~6 pacotes | Perda tooling superadmin |
| Shadow wiring | 2 call sites worker | Perda comparação opcional |

**Código morto relevante ao motor CRM:** mínimo. **Dívida principal:** ecossistema de migração 2.3x ainda no repositório.
