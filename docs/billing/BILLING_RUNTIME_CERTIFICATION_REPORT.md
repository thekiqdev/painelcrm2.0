# BILLING_RUNTIME_CERTIFICATION_REPORT

**Sprint:** 4.0A.1  
**Suite:** `billingProvisionRuntimeCertification.test.ts` + `billingPlanProvision.test.ts` + `billingPlanRepairService.test.ts`

## Cobertura

| Área | Cenários |
|------|----------|
| SQL audit estático | `clients` JOIN, `billing_plans`, `billing_plan_items`, rollback subscription |
| Nova assinatura | provision transacional |
| Assinatura antiga | repair automático |
| Plano inexistente / draft / archived | repair paths |
| Itens inexistentes / janela efetiva | create + `effective_from` fix |
| Idempotência | plano válido → noop |
| Tenant isolation | `TENANT_MISMATCH` |
| Worker / manual renewal | `periodStartYmd` |
| SaaS | noop |
| Métricas + health | degraded / healthy |
| PG 42703 | `tenant_resolution_errors` |
| Pipeline invoice | `planItemResolver` contrato |

## Resultado

- Mínimo exigido: **35 testes**
- Executado: **70+** testes no pacote `billingPlatform/provisioning`
- Build TypeScript: **limpo**

## Certificação

```
RUNTIME_CERTIFICATION = APPROVED
```
