# BILLING ENGINE V2 — Sprint 2.4A — Billing Certification Suite

**Data:** 2026-06-26  
**Modo:** CERTIFICATION — READ ONLY — Nenhuma cobrança, nenhuma alteração de produção

---

## Resumo

Criada a **Billing Certification Suite**, camada oficial de certificação do Billing Engine V2. Responde de forma determinística:

> **"O novo motor consegue substituir completamente o motor legado para todas as assinaturas existentes?"**

Decisão binária: **CERTIFIED** ou **NOT_CERTIFIED** — sem aprovação parcial.

---

## Princípio: orquestração exclusiva

A Certification Suite **não cria** novas regras, modelos, cálculos ou engines. Reutiliza obrigatoriamente:

| Módulo | Uso |
|--------|-----|
| `BillingExecutionContextBuilder` | Contexto por assinatura |
| `BillingProjectionEngine` | Projeção V2 |
| `BillingConsistencyValidator.validateFromContext()` | Consistência |
| `RenewalComparisonService.compareWithProjection()` | Shadow comparison |
| `analyzeMigrationImpact` + `resolveSimulationRecommendation` | Simulator (slice) |
| `evaluateTenantMigrationReadiness()` | Readiness (tenant) |
| `runMigrationSimulation()` | Simulator (tenant) |
| `BillingCutoverOrchestrator.evaluateTenant()` | Cutover (tenant) |

A lógica de decisão final está em `certificationScorer.ts` — apenas agregação determinística dos resultados upstream.

---

## Fluxo

```text
Todas as subscriptions ativas (customer)
        │
        ▼
BillingExecutionContext
        │
        ▼
Projection → Consistency → Shadow Comparison
        │
        ▼
Migration Simulator (slice)
        │
        ▼
Migration Readiness (tenant)
        │
        ▼
Migration Simulator (tenant)
        │
        ▼
Cutover Policy (tenant)
        │
        ▼
Billing Certification Suite
        │
        ├── CERTIFIED (score 100)
        └── NOT_CERTIFIED
```

---

## Gates por assinatura

| Stage | Critério de aprovação |
|-------|----------------------|
| Context | Sem errors/warnings críticos |
| Projection | `score = 100`, `approved` |
| Consistency | `approved = true`, `confidence = 100` |
| Shadow | `approved = true`, `score = 100`, sem diffs ERROR/CRITICAL |
| Simulator | `READY_TO_MIGRATE` |
| Readiness | `readyForMigration`, `READY_TO_MIGRATE` |
| Cutover | `approved`, `ENABLE_V2` |

Certificação somente quando **todos** os gates passam → `certification_score = 100`.

---

## Certification Report

Tabela `billing_certification_reports` (migration `289`):

- `tenant_id`, `subscription_id`, `correlation_id`
- `certification_score`, `certified`, `certified_at`, `recommendation`
- `projection_summary_json`, `consistency_summary_json`, `shadow_summary_json`
- `readiness_summary_json`, `simulator_summary_json`, `cutover_summary_json`
- `failures_json`, `warnings_json`, `report_json`
- TTL: **90 dias**

---

## APIs

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/superadmin/billing/certification` | Dashboard global |
| GET | `/api/superadmin/billing/certification/:subscriptionId` | Certificação por assinatura |
| POST | `/api/superadmin/billing/certification/run` | Suite completa (todas as assinaturas) |
| POST | `/api/superadmin/billing/certification/:subscriptionId/evaluate` | Nova certificação |

### Dashboard cards

- Total Assinaturas, Certificadas, Reprovadas
- Certification Score Médio
- Projection 100%, Shadow 100%, Consistency 100%
- Simulator OK, Cutover OK
- `engine_certified` (100% certificadas)

### Por assinatura

Resposta inclui `status: CERTIFIED | FAILED` e snapshots de cada stage, `failures[]`, `warnings[]`, `recommendation`.

---

## Engine Health

Novo bloco em `billingEngineHealth()`:

```typescript
certification: {
  healthy: boolean;
  total_subscriptions: number;
  certified: number;
  failed: number;
  average_score: number | null;
  engine_certified: boolean;
  last_evaluation: string | null;
}
```

---

## Logs

| Tag | Uso |
|-----|-----|
| `[CERTIFICATION]` | Início/fim da suite |
| `[CERTIFICATION_STAGE]` | Cada stage (context, projection, etc.) |
| `[CERTIFICATION_RESULT]` | Resultado final por assinatura |
| `[CERTIFICATION_FAILED]` | Falha com código de bloqueio |

Todos incluem `correlation_id`, `tenant_id`, `subscription_id`, `score`, `duration_ms`.

---

## Arquivos criados

```
database/init/289_billing_certification_reports.sql

packages/backend/src/billingCertification/
  types.ts
  certificationScorer.ts
  billingCertificationEngine.ts
  billingCertificationRepository.ts
  billingCertificationService.ts
  certificationLogger.ts
  certificationMetrics.ts
  index.ts
  billingCertification.test.ts
```

---

## Arquivos alterados

- `packages/backend/src/services/billingEngineHealthService.ts`
- `packages/backend/src/controllers/superadminBillingController.ts`
- `packages/backend/src/routes/superadminRoutes.ts`
- `packages/backend/src/startup/migrationOrder.ts`

---

## Testes

| Cenário | Resultado |
|---------|-----------|
| Assinatura perfeita | CERTIFIED |
| Divergência Projection | NOT_CERTIFIED |
| Divergência Shadow | NOT_CERTIFIED |
| Falha Consistency | NOT_CERTIFIED |
| Readiness bloqueado | NOT_CERTIFIED |
| Simulator bloqueado | NOT_CERTIFIED |
| Cutover bloqueado | NOT_CERTIFIED |
| Report shape | snapshots obrigatórios |

**8 testes** — todos passando. `npm run build` ✅

---

## Compatibilidade

- Motor V1 continua oficial
- Nenhuma invoice, gateway, notificação ou feature flag alterada
- Upstream modules executados com `persist: false` durante certificação
- **Única escrita:** `billing_certification_reports`

---

## Critério de conclusão operacional

A sprint de código está concluída. A **certificação operacional** do motor exige:

```
POST /api/superadmin/billing/certification/run
```

com resultado `engine_certified: true` (100% das assinaturas ativas = CERTIFIED).

Somente após esta certificação em ambiente real será autorizada a **Sprint 2.4B — Billing Engine V2 Activation**.

Inconsistências encontradas devem ser corrigidas nos módulos upstream existentes — não na Certification Suite.

---

## Conclusão

A Billing Certification Suite fecha o ciclo de governança pré-ativação: uma camada única que consolida todas as evidências V2 e emite decisão binária por assinatura e para o motor como um todo, sem duplicar regras de negócio.
