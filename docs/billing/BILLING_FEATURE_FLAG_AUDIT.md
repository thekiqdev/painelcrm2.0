# Billing Engine 3.0 — Feature Flag Audit

**Data:** 2026-06-26

---

## Flags de migração CRM (ainda presentes)

| Variável | Default | Definida em | Consumidores produção |
|----------|---------|-------------|----------------------|
| `BILLING_PLAN_V2` | `false` | `config/billingEnv.ts` | `billingExecutionContextBuilder` (metadata), `billingPlanProvider` (sem caller hot path) |
| `BILLING_PLAN_V2_SHADOW` | `false` | `config/billingEnv.ts` | `billingShadowExecutor`, `recurringBillingJobService` (pós-job CRM+SaaS), `billingShadowReportService` |

### Comportamento CRM com flags

| Flag | CRM renewal hot path afetado? |
|------|------------------------------|
| `BILLING_PLAN_V2=false` | **NÃO** — worker sempre usa `resolvePlanAndItems` |
| `BILLING_PLAN_V2=true` | **NÃO** — apenas metadata `billing_plan_v2: true` |
| `BILLING_PLAN_V2_SHADOW=false` | Shadow skip — **nenhum efeito** |
| `BILLING_PLAN_V2_SHADOW=true` | Executa `runBillingShadowComparison` após job — **não altera invoice produzida** |

---

## Outras flags relacionadas (não CRM billing engine)

| Flag / conceito | Contexto |
|-----------------|----------|
| `crm_use_worker_v2_pipeline` | Error code permanente — bloqueia CRM em `BillingRenewalEngine` ✅ |
| `workflow.shadow_execution_v1` | Platform feature flags — unrelated |
| Cutover `ENABLE_V2` | `billingCertification` lab only |

---

## Metadata em contexto (não env flag)

`BillingExecutionContext.metadata.feature_flags`:

```typescript
billing_plan_v2: isBillingPlanV2Enabled()
billing_plan_v2_shadow: isBillingPlanV2ShadowEnabled()
```

Informativo — não roteia execução.

---

## Resultado esperado vs atual

| Critério sprint | Atual |
|----------------|-------|
| Nenhuma flag migração CRM | ❌ 2 env vars |
| Apenas flags permanentes | ⚠️ `crm_use_worker_v2_pipeline` é guard, não flag |

---

## Recomendação (Sprint housekeeping)

1. Remover `BILLING_PLAN_V2` e `BILLING_PLAN_V2_SHADOW` de `billingEnv.ts`
2. Remover shadow calls em `recurringBillingJobService.ts`
3. Deletar `billingPlanProvider.ts` ou fixar modo `billing_plan_items` only
4. Remover campos `billing_plan_v2*` de `BillingExecutionContext` types

**Veredito:** ❌ FAIL critério estrito — flags existem mas **não controlam mais o motor CRM**.
