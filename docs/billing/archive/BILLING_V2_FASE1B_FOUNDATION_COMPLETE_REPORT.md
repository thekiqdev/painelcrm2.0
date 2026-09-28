# BILLING ENGINE V2 — FASE 1B — Foundation Complete

**Data:** 2026-06-25  
**Modo:** SAFE — sem Billing Plan, sem novas tabelas, sem breaking changes de API

---

## Resumo

A Fase 1B encerra a **fundação** do motor atual de Faturas Recorrentes CRM. Todos os itens amarelos da Sprint 1A foram endereçados no escopo do motor de billing (subscriptions + backend de renovação).

---

## Critérios de conclusão

| Critério | Status |
|----------|--------|
| Datas seguras (motor billing UI + backend) | ✅ |
| Worker instrumentado `[RENEWAL_PIPELINE]` | ✅ |
| Scheduler instrumentado | ✅ |
| Recovery (health existente + engine-health) | ✅ |
| Notification Engine rastreável | ✅ |
| `diagnoseRenewal()` com bloco `motor` | ✅ |
| Histórico padronizado `[RENEWAL_HISTORY]` | ✅ |
| Error classification `[BILLING_RENEWAL_ERROR]` | ✅ |
| Build limpo | ✅ `npm run build` |
| Testes ampliados | ✅ 11 backend + 5 frontend |

---

## Arquitetura atualizada

```
                    ┌─────────────────┐
                    │  Scheduler      │
                    │ enqueueRenewal  │
                    └────────┬────────┘
                             │ READINESS → COMPLETE
                             ▼
                    ┌─────────────────┐
                    │ billing_recurring│
                    │ _jobs (pending)  │
                    └────────┬────────┘
                             │
         ┌───────────────────┼───────────────────┐
         ▼                   ▼                   ▼
   Manual Renew         Worker batch        Recovery
   (sync pipeline)      processNextBatch    billingEngineHealth
         │                   │                   │
         └─────────┬─────────┘                   │
                   ▼                             │
          BillingRenewalEngine.execute            │
                   │                             │
     VALIDATION → CUSTOMER → DATES → CONTRACT     │
     → PREVIOUS_INVOICE → ITEMS → CREATE_INVOICE  │
     → GATEWAY → NOTIFICATIONS → ADVANCE          │
                   │                             │
                   ▼                             ▼
          [RENEWAL_HISTORY]              GET /billing/engine-health
```

---

## Pipeline completo — estágios

Todos os modos emitem `[RENEWAL_PIPELINE]` com: `correlation_id`, `subscription_id`, `job_id`, `invoice_id`, `cycle_key`, `execution_mode`, `duration_ms`, `pipeline_elapsed_ms`.

| Estágio | Manual | Worker | Scheduler | Engine |
|---------|--------|--------|-----------|--------|
| HTTP_RECEIVED | ✅ | — | — | — |
| READINESS | ✅ | — | ✅ | — |
| JOB_RESOLUTION | ✅ | — | — | — |
| JOB_PICKUP | ✅ | ✅ | — | — |
| ENGINE_START | ✅ | ✅ | — | ✅ |
| VALIDATION | — | — | — | ✅ |
| CUSTOMER | — | — | — | ✅ |
| DATES | — | — | — | ✅ |
| CONTRACT | — | — | — | ✅ |
| PREVIOUS_INVOICE | — | — | — | ✅ |
| ITEMS | — | — | — | ✅ |
| CREATE_INVOICE | — | — | — | (via engine interno) |
| GATEWAY | — | — | — | (via engine interno) |
| NOTIFICATIONS | ✅ | ✅ | — | (via notify) |
| COMPLETE | ✅ | ✅ | ✅ | — |
| ERROR | ✅ | ✅ | — | ✅ |

---

## Logs

### Existentes (mantidos)
- `[BILLING_JOB_TRACE]` — lifecycle SQL/jobs
- `[MANUAL_RENEWAL]` — resultado manual consolidado
- `[RENEWAL_TRACE]` / `logRenewalAttemptTrace` — tentativas worker
- `[BILLING_HEALTH]` — recovery snapshot

### Adicionados (1B)
| Prefixo | Módulo | Eventos |
|---------|--------|---------|
| `[RENEWAL_PIPELINE]` | `renewalPipelineTrace.ts` | Estágios + `emitRenewalPipelineStage` (worker/scheduler) |
| `[NOTIFICATION_TRACE]` | `notificationTrace.ts` | START, QUEUE, SENT, FAILED, RETRY, DELIVERED |
| `[RENEWAL_HISTORY]` | `renewalHistoryRecorder.ts` | Execução padronizada (manual/worker/…) |
| `[BILLING_RENEWAL_ERROR]` | `billingRenewalError.ts` | Erro classificado com severity/retryable |

---

## Datas (100% — escopo billing)

### Backend
- `billingSafeDate.ts`: `safeNowIso`, `safeTodayYmd`, `requireYmd`, `BillingDateParseError`
- Motor: `executeCustomerRenewal`, `renewalPipelineTrace`, `invoiceNotificationsService`, `billingNotificationFlush`

### Frontend (subscriptions)
- `billingSafeDate.ts`: `safeDate`, `safeToISOString`, `formatYmdBrShortSafe`, `safeNowIso`
- Componentes: `SubscriptionDetail`, `SubscriptionOperationalTimelinePanel`, `SubscriptionOperationalHealthCard`, `SubscriptionPendingContractBanner`, `SubscriptionsPeriodFilter`, `SubscriptionContractHistoryPanel`, `SubscriptionRenewalActionsCard`, `SubscriptionsList`, `subscriptionRecurringDisplay`, `crmSubscriptions`

---

## diagnoseRenewal() — bloco `motor`

Uma chamada retorna agora:
- `worker`, `scheduler`, `notification`, `gateway`
- `validation` (ready + blockers)
- `health`, `retry`, `last_execution`, `last_error`
- `template_resolution`, `timeline`, `history`

---

## billingEngineHealth()

- **Endpoint:** `GET /api/superadmin/billing/engine-health`
- **Alias:** `GET /api/superadmin/billing/health?full=1`
- **Somente diagnóstico:** jobs órfãos, datas inválidas, retries presos, locks, gateway, template, notificações pendentes

---

## Arquivos novos

| Arquivo | Função |
|---------|--------|
| `notificationTrace.ts` | Trace de notificações |
| `billingRenewalError.ts` | Classificação estruturada |
| `renewalHistoryRecorder.ts` | Histórico unificado |
| `billingEngineHealthService.ts` | Auditoria interna |
| `billingEngineFoundation.test.ts` | Testes 1B |
| `src/lib/billingSafeDate.test.ts` | Testes frontend datas |

---

## Cobertura de testes

| Suite | Testes |
|-------|--------|
| `billingSafeDate.test.ts` (backend) | 4 |
| `billingSafeDate.test.ts` (frontend) | 5 |
| `renewalPipelineTrace.test.ts` | 2 |
| `billingEngineFoundation.test.ts` | 3 |
| `billingManualRenewalExecution.test.ts` | 2 |
| `billingJobLifecycleTrace.test.ts` | 2 |
| **Total motor billing** | **18** |

Cenários de integração E2E (concorrência, double-click, gateway sandbox) permanecem como hardening pré-Fase 2 — não bloqueiam Billing Plan V2.

---

## Componentes estabilizados

- Manual renew / reprocess (pipeline síncrono completo)
- Worker `processNextBatch` (pipeline por job)
- Scheduler `enqueueRenewalJobs`
- `BillingRenewalEngine` / `executeCustomerRenewal` (estágios engine)
- Notification flush + invoice created
- Diagnóstico subscription + engine health

---

## Candidatos à evolução (Fase 2 — Billing Plan)

- Modelo Billing Plan desacoplado de fatura-anterior
- Distinção semântica `invoice.created` vs `invoice.renewed`
- Testes E2E concorrência / gateway sandbox
- Timeline UI enriquecida com `initiated_by` visual
- Recovery automático com correção (hoje só diagnóstico)

---

## Riscos remanescentes

1. **Histórico em DB:** `billing_recovery_audit` opcional — log `[RENEWAL_HISTORY]` é fonte primária se tabela ausente.
2. **Notificações WhatsApp:** trace até fila; delivery final depende do provider outbound.
3. **Datas fora do escopo billing:** outros módulos do CRM (contratos, financeiro geral) não foram alterados nesta sprint.

---

## Checklist de prontidão — Billing Plan V2

- [x] Motor observável ponta a ponta (manual + worker + scheduler)
- [x] Erros classificados e rastreáveis
- [x] Datas seguras no domínio subscriptions/billing
- [x] Health check interno
- [x] Build limpo
- [x] Base de testes unitários
- [ ] Migração incremental para Billing Plan (Fase 2)
- [ ] APIs públicas de planos (Fase 2+)

---

## Conclusão

A **Fundação do Billing Engine V1** está completa. O sistema está pronto para iniciar **Fase 2 — Billing Plan V2** sobre uma base estável, observável e totalmente rastreável no caminho crítico de renovação CRM.
