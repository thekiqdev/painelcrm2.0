# BILLING ENGINE V2 — Sprint 3.1A — Production Stabilization & Observability

**Data:** 2026-06-26  
**Modo:** PRODUCTION OBSERVABILITY  
**Breaking changes:** Não  
**Database changes:** Não  
**Feature flags:** Nenhuma

---

## Resumo

Camada de observabilidade operacional para o pipeline V2 pós-cutover (Sprint 3.1). **Nenhuma regra de negócio alterada** — apenas coleta de métricas, health checks, profiler e auditoria contínua antes da remoção do legado (Sprint 3.2).

---

## Novos módulos (`packages/backend/src/billingObservability/`)

| Módulo | Responsabilidade |
|--------|------------------|
| `billingMetricsCollector.ts` | Coleta in-memory de indicadores de execução |
| `billingObservabilityService.ts` | Agrega métricas, health e dashboard |
| `billingHealthDashboard.ts` | 10 cards operacionais |
| `billingOperationalAudit.ts` | Auditoria contínua + recomendações |
| `billingPerformanceProfiler.ts` | Tempo por estágio do pipeline |
| `workerObservationRecorder.ts` | Instrumentação do Worker V2 |
| `observabilityLogger.ts` | Logs `[BILLING_METRICS]`, etc. |

**Versão:** `v2_observability_sprint_3_1a`

---

## Métricas consolidadas

`renewals_total`, `renewals_success`, `renewals_failed`, `gateway_success_rate`, `notification_success_rate`, `timeline_success_rate`, `history_success_rate`, `average_execution_time`, `max_execution_time`, `job_retry_rate`, `idempotency_hits`, `orphan_jobs`, `engine_errors`, `context_errors`, `billing_plan_errors`, `billing_items_errors`

---

## Dashboard (10 cards)

Total Renewals, Success Rate, Average Duration, Gateway Success, Notification Success, Retry Rate, Engine Errors, Context Errors, Billing Plan Errors, Billing Item Errors

---

## Health checks (8 estágios)

ExecutionContext, BillingEngineV2, PersistenceOrchestrator, Gateway, Notifications, Timeline, History, Subscription Advance

---

## API

```
GET /api/superadmin/billing/v2-observability
GET /api/superadmin/billing/v2-observability?audit=1
```

Resposta: `metrics`, `dashboard`, `health`, `performance`, `audit` (opcional)

---

## Logs

- `[BILLING_METRICS]`
- `[BILLING_HEALTH]`
- `[BILLING_AUDIT]`
- `[BILLING_PERFORMANCE]`

---

## Instrumentação (mínima)

`workerCrmRenewalPipeline.ts` — profiler + `recordWorkerRenewalSuccess` / `recordWorkerRenewalFailure` em try/catch (rethrow preservado).

---

## Testes

```bash
npx vitest run src/billingObservability/billingObservability.test.ts
# 24+ testes (mínimo exigido: 20)
npm run build
```

---

## Definition of Done

| Item | Status |
|------|--------|
| Dashboard operacional disponível | ✅ |
| Health completo do pipeline | ✅ |
| Métricas consolidadas | ✅ |
| Auditoria contínua | ✅ |
| Sem alteração funcional no engine | ✅ |
| Build limpo | ✅ |
| Testes aprovados | ✅ |

---

## Exit criteria (monitoramento contínuo)

Antes da Sprint 3.2, validar em produção:

- Nenhum erro crítico recorrente (`billing_plan_errors`, `orphan_jobs`)
- Gateway estável (≥ 85%)
- Notificações estáveis (≥ 85%)
- Retries dentro do esperado (< 25%)
- Auditoria `healthy: true`

---

## Próxima sprint

**3.2 — Legacy Removal**
