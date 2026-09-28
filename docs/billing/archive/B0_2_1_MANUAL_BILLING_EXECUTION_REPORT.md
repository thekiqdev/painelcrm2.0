# B0.2.1 — Manual Billing Execution (Hotfix Crítico)

Relatório de implementação: execução síncrona imediata das ações manuais de renovação CRM, sem dependência do scheduler/worker assíncrono.

---

## 1. Arquitetura anterior

```
Operador (UI)
    ↓ POST generate-now / reprocess
billingManualRenewalService
    ↓ prepareJobForImmediateRun (UPDATE retry_at=NULL)
    ↓ executeRenewalJobById → processNextBatch({ onlyJobId })
processNextBatch (modo automático)
    ↓ filtros SQL: scheduled_at <= now(), retry_at IS NULL OR retry_at <= now()
    ↓ reclaim stale locks, sanitize locks
    ↓ janela horária local → requeue se fora da janela
    ↓ batch vazio → processed=0, failed=0
UI: request_error / 0ms / "job não executado"
```

**Falha:** mesmo com `retry_at` limpo no prepare, o worker ainda aplicava filtros de elegibilidade do scheduler (janela horária, backoff diagnostic, reclaim) e podia retornar batch vazio sem executar `processOneCustomerRenewalJob`.

---

## 2. Arquitetura nova

```
Operador (UI)
    ↓ POST /manual-renew ou /manual-reprocess
billingManualRenewalService
    ↓ validação (diagnoseRenewal / readiness)
    ↓ ensureJobForManualGenerate OU localizar job pendente/failed
    ↓ runSynchronousManualPipeline()
        ↓ executeRenewalJobSynchronously(jobId, workerId, { manualExecution: true })
        ↓ processNextBatch com manualExecution:
            - prepara job (pending, scheduled_at=now, retry_at=NULL)
            - SQL sem retry_at/scheduled_at
            - sem reclaim/sanitize automático
            - sem requeue de janela horária
            - processOneCustomerRenewalJob (pipeline completo)
        ↓ flushBillingNotificationSideEffects()
    ↓ resposta enriquecida (invoice, gateway, notification, cycle_key, logs)
UI: checklist ✓ fatura / gateway / notificação + refresh timeline/histórico
```

**Scheduler/worker automático:** inalterado — continua usando `retry_at`, `scheduled_at`, backoff, janela e batch SKIP LOCKED.

---

## 3. Pontos reutilizados (sem duplicação)

| Componente | Uso |
|------------|-----|
| `processNextBatch` + `processOneCustomerRenewalJob` | Pipeline único worker + manual |
| `validateRenewalContext` / `resolveAndPersistSubscriptionCustomerId` | Dentro do worker (B0.1) |
| `insertOrReactivateRenewalJob` | Criação/reativação de job no generate |
| `diagnoseRenewalForTenant` / `assessManualGenerateReadiness` | Pré-validação manual |
| `flushBillingNotificationSideEffects` | Notificações pós-execução |
| `renewalAttemptTrace` / `billingLog` | Rastreio existente no worker |

**Wrapper novo:** `runSynchronousManualPipeline()` em `billingManualRenewalService.ts` — não duplica lógica de faturamento.

**Flag:** `ExecuteRenewalJobOptions.manualExecution` em `recurringBillingJobService.ts`.

---

## 4. Código compartilhado

- **Worker:** `processNextBatch(workerId)` — sem `manualExecution`.
- **Manual:** `executeRenewalJobSynchronously(jobId, workerId, { manualExecution: true })`.
- Ambos convergem em `processOneCustomerRenewalJob` para: validação → customer → repair dates → invoice → gateway → advance subscription → timeline/history.

---

## 5. Impacto na renovação automática

- **Nenhuma regressão intencional:** caminho automático só ativa `manualExecution` quando explicitamente passado.
- Reclaim, sanitize, filtros `retry_at`/`scheduled_at`, requeue de janela — **preservados** no modo worker.
- Testes existentes de readiness, validação e customer resolution permanecem válidos.

---

## 6. Impacto na renovação manual

| Antes | Depois |
|-------|--------|
| Depende de batch worker | Execução síncrona na request HTTP |
| Ignora parcialmente scheduler | Ignora totalmente retry_at, janela, backoff |
| Resposta mínima | `ManualBillingExecutionResult` completo |
| Endpoints `generate-now` / `reprocess` | Novos `manual-renew` / `manual-reprocess` (+ aliases legados) |

---

## 7. Idempotência e concorrência

- **Job em `processing`:** bloqueado antes de executar (`findProcessingJobId`).
- **Ciclo já `completed`:** `ensureJobForManualGenerate` retorna erro `skipped_completed_cycle`.
- **Lock:** manual prepara job como `pending` e usa `FOR UPDATE` no mesmo job — worker concorrente não pega o mesmo registro se já `processing`.
- **Dupla execução simultânea:** segunda request recebe `job_processing` se a primeira já marcou `processing`.
- Reprocess **não cria** novo job — reutiliza pendente/failed do ciclo.

---

## 8. Fluxo completo de execução (manual-renew)

1. `GET renewal-diagnosis` (UI)
2. Operador confirma → `POST /api/crm-subscriptions/:id/manual-renew`
3. `assessManualGenerateReadiness` — bloqueia customer/template/datas
4. `ensureJobForManualGenerate` — pending existente ou insert/reactivate
5. `executeRenewalJobSynchronously` com `manualExecution: true`
6. Worker pipeline: invoice + gateway + subscription advance + timeline
7. `flushBillingNotificationSideEffects`
8. Resposta JSON + log `[MANUAL_RENEWAL]`
9. UI atualiza timeline, histórico, faturas via `onActionComplete`

---

## 9. API

| Método | Rota | Função |
|--------|------|--------|
| POST | `/api/crm-subscriptions/:id/manual-renew` | `manualRenewSubscription` |
| POST | `/api/crm-subscriptions/:id/manual-reprocess` | `manualReprocessSubscription` |
| POST | `/api/admin/subscriptions/:id/manual-renew` | alias admin |
| POST | `/api/admin/subscriptions/:id/manual-reprocess` | alias admin |

Permissão: `billing.edit_subscription`.

Resposta: `ManualBillingExecutionResult` com `execution_mode: "manual"`.

---

## 10. Logs

Trace `[MANUAL_RENEWAL]` com: `subscription_id`, `cycle_key`, `started_at`, `finished_at`, `duration_ms`, `invoice_id`, `gateway_status`, `notification_sent`, `result`, `success`, `correlation_id`.

Complementar: `[BILLING_MANUAL]` para auditoria em `billing_recovery_audit`.

---

## 11. Frontend

- `SubscriptionRenewalActionsCard`: "Processando renovação…" durante POST + polling de diagnóstico a cada 2s.
- Ao concluir: checklist fatura / gateway / notificação.
- `onActionComplete` recarrega assinatura (timeline, histórico, próxima cobrança).

---

## 12. Testes

- `billingManualRenewalExecution.test.ts` — pipeline síncrono + bloqueio not_ready.
- `renewalManualReadiness.test.ts` — readiness (janela ignorada manualmente).
- Suíte backend completa executada no build.

---

## 13. Arquivos alterados

**Backend**
- `recurringBillingJobService.ts` — `manualExecution`, `executeRenewalJobSynchronously`
- `billingManualRenewalService.ts` — `runSynchronousManualPipeline`, endpoints aliases
- `crmSubscriptionsController.ts` — handlers manual-renew/reprocess
- `crmSubscriptionsRoutes.ts`, `adminSubscriptionsRoutes.ts` — rotas

**Frontend**
- `crmSubscriptions.ts` — tipos + endpoints manual-renew/reprocess
- `SubscriptionRenewalActionsCard.tsx` — UX processamento + checklist

**Docs**
- Este relatório.
