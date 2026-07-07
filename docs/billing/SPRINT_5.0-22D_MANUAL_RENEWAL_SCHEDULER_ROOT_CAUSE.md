# Sprint 5.0-22D — Manual Renewal Runtime & Scheduler Audit

**Modo:** INVESTIGATION (READ ONLY)  
**Data:** 2026-07-04  
**Escopo:** Por que, após **Gerar próxima cobrança**, a UI fica só com projeções até o scheduler/restart; e se a causa é **(A)** backend não cria o próximo `subscription_cycle` no POST ou **(B)** o GET não devolve o ciclo.

---

## Veredicto (ROOT CAUSE)

| Hipótese | Veredito | Evidência |
|----------|----------|-----------|
| **(A)** Próximo cycle **não** é criado durante o POST | **VERDADEIRO** | `advanceSubscriptionAfterCompletedCycle` só faz `UPDATE subscriptions`; nenhuma chamada a `insertOrReactivateRenewalJob` / `subscriptionCyclesUpsertAfterScheduler` para o **novo** `next_billing_date` após o avanço |
| **(B)** GET omite cycle que já existe no DB | **FALSO** | `getCrmSubscriptionDetail` → `listSubscriptionCyclesBySubscriptionId` = SQL direto, sem cache |
| **(C)** Cycle existe mas payload errado | **FALSO** como causa primária | Só ocorreria se scheduler já tivesse inserido a linha |
| **(D)** Frontend perde dado | **FALSO** como causa primária | `handleGenerateBilling` chama `await load()` → GET fresco; UI mostra projeção porque **não há cycle real elegível** |

**Resposta objetiva:** **(A)** — o próximo `subscription_cycle` (C+1) **não nasce no POST manual**. Nasce depois, quando o **Billing Scheduler** (`enqueueRenewalJobs` → `insertOrReactivateRenewalJob` → `subscriptionCyclesUpsertAfterScheduler`) enfileira job para o **novo** `next_billing_date`.

**Primeiro ponto exato onde a informação deixa de existir:** fim de `BillingExecutionOrchestrator.execute` / `advanceSubscriptionCycle` — avança `subscriptions.next_billing_date` **sem** dual-write do ciclo seguinte. O GET imediato reflete fielmente esse buraco; a UI projeta C+1 a partir de `next_billing_date`.

---

## 1. Call graph — POST `/manual-renew`

### Entrada HTTP

```
POST /api/crm-subscriptions/:id/manual-renew
  crmSubscriptionsController.postCrmSubscriptionManualRenewHandler  (L491–532)
    manualRenewSubscription                                         (billingManualRenewalService.ts L726)
      generateInvoiceForCycle                                       (billingCycleInvoiceGenerationService.ts L73)
        resolveCycleIdForManualGeneration / validateCycleForInvoiceGeneration
        manualGenerateRenewalNow                                    (billingManualRenewalService.ts L753)
```

### `manualGenerateRenewalNow` — árvore completa

```
manualGenerateRenewalNow
├── diagnoseRenewalForTenant
├── assessManualGenerateUnblocked
├── ensureJobForManualGenerate                                    (L301)
│   ├── loadRenewalEnqueueJoinRow
│   ├── resolveAndPersistSubscriptionCustomerId                   (se customer_id nulo)
│   ├── applyPendingCrmSubscriptionContractIfDue                  (best-effort)
│   ├── prepareJobForImmediateRun                                 (UPDATE billing_recurring_jobs)
│   └── insertOrReactivateRenewalJob                              (recurringBillingJobService.ts L356)
│       └── subscriptionCyclesUpsertAfterScheduler                (dualWriteService.ts L72)  ← CICLO **ATUAL** only
├── runSynchronousManualPipeline                                  (L510)
│   ├── executeRenewalJobSynchronously                            (recurringBillingJobService.ts L916)
│   │   └── processNextBatch                                      (onlyJobId, manualExecution: true)
│   │       └── workerCrmRenewalPipeline (CRM customer)
│   │           ├── BillingExecutionOrchestrator.execute
│   │           │   ├── persistCustomerInvoiceFromDraft             → INSERT customer_invoices
│   │           │   ├── persistCustomerInvoiceItemsFromDrafts       → INSERT customer_invoice_items
│   │           │   ├── executeGatewayChargeForInvoice
│   │           │   ├── executeTimelineEvents
│   │           │   └── advanceSubscriptionCycle                    (subscriptionCycleService.ts L8)
│   │           │       └── advanceSubscriptionAfterCompletedCycle  → UPDATE subscriptions ONLY
│   │           └── completeBillingRecurringJob
│   │               └── subscriptionCyclesOnJobCompleted          → UPSERT cycle **ATUAL** status=invoiced
│   └── flushBillingNotificationSideEffects
└── insertManualRenewalAudit                                      → INSERT billing_recovery_audit
```

### Funções **não** chamadas no POST manual (grep confirmado)

| Função | Chamada no POST? |
|--------|------------------|
| `tryEnqueueRenewalJobForSubscriptionId` | **NÃO** |
| `enqueueRenewalJobs` | **NÃO** |
| `subscriptionCyclesEnsure` | **NÃO existe no repo** |
| `subscriptionCycleCreate` / `createNextCycle` | **NÃO existem no repo** |
| `subscriptionCyclesUpsertAfterScheduler` para C+1 | **NÃO** (só via `insertOrReactivateRenewalJob` do ciclo **corrente** em `ensureJobForManualGenerate`) |

### Repositories / serviços de persistência tocados

| Camada | Arquivo | Operação |
|--------|---------|----------|
| Jobs | `recurringBillingJobService.ts` | INSERT/UPDATE `billing_recurring_jobs` |
| Cycles dual-write | `subscriptionCyclesDualWriteService.ts` | UPSERT `subscription_cycles` (atual) |
| Invoices | `invoicePersistenceService.ts` | INSERT `customer_invoices` + items |
| Subscription | `billingRecurringJobPersistence.ts` | UPDATE `subscriptions` (advance) |
| Job complete | `billingRecurringJobPersistence.ts` | UPDATE `billing_recurring_jobs` completed |
| Audit | `billingManualRenewalService.ts` | INSERT `billing_recovery_audit` |

---

## 2. Mutations no banco — POST manual (ANTES → DEPOIS)

### Tabelas com INSERT

| Tabela | Quando | Função |
|--------|--------|--------|
| `billing_recurring_jobs` | Se não existir job pending para ciclo **C** | `insertOrReactivateRenewalJob` |
| `customer_invoices` | Engine aprovou | `persistCustomerInvoiceFromDraft` |
| `customer_invoice_items` | Idem | `persistCustomerInvoiceItemsFromDrafts` |
| `billing_recovery_audit` | Fim do POST | `insertManualRenewalAudit` |
| `subscription_cycles` | Dual-write do ciclo **C** (queued → invoiced) | `subscriptionCyclesUpsertAfterScheduler` + `subscriptionCyclesOnJobCompleted` |

### Tabelas com UPDATE

| Tabela | O quê | Função |
|--------|-------|--------|
| `billing_recurring_jobs` | pending → processing → completed | worker pipeline |
| `subscription_cycles` | status → `invoiced`, `invoice_id` set | `subscriptionCyclesOnJobCompleted` |
| `subscriptions` | `next_billing_date`, `current_period_*`, `billing_cycle_count` | `advanceSubscriptionAfterCompletedCycle` |

### Existe novo cycle C+1 após o POST?

**NÃO.**

Evidência de código — avanço só atualiza assinatura:

```401:406:packages/backend/src/services/billingRecurringJobPersistence.ts
  await updateSubscriptionAfterRenewal(db as SubscriptionRenewalDb, params.subscriptionId, params.tenantId, {
    next_billing_date: decision.finalNextYmd,
    current_period_start: decision.cycleDate,
    current_period_end: decision.finalNextYmd,
    billing_cycle_count: nextCount,
  });
```

Nenhuma linha após `advanceSubscriptionAfterCompletedCycle` chama `tryEnqueueRenewalJobForSubscriptionId` ou `subscriptionCyclesUpsertAfterScheduler` com o **novo** `finalNextYmd`.

### Modelo ANTES / DEPOIS (subscription_cycles)

Assinatura semanal exemplo: C=`2026-07-09` faturado → novo `next_billing_date`=`2026-07-16`.

**ANTES do POST**

| id | cycle_date | status | invoice_id | job_id | metadata |
|----|------------|--------|------------|--------|----------|
| uuid-C | 2026-07-09 | queued/pending | NULL | job-C | dual_write scheduler/manual |
| *(nenhuma linha 2026-07-16)* | | | | | |

**DEPOIS do POST (COMMIT HTTP 200)**

| id | cycle_date | status | invoice_id | job_id | metadata |
|----|------------|--------|------------|--------|----------|
| uuid-C | 2026-07-09 | **invoiced** | inv-xxx | job-C | outcome completed |
| *(ainda nenhuma linha 2026-07-16)* | | | | | |

**subscriptions:** `next_billing_date` = `2026-07-16` (já avançado).

---

## 3. Quem cria o próximo `subscription_cycle`

### Onde nasce (arquivo · função · linha · condição)

| Campo | Valor |
|-------|-------|
| **Arquivo** | `packages/backend/src/services/subscriptionCyclesDualWriteService.ts` |
| **Função** | `subscriptionCyclesUpsertAfterScheduler` |
| **Linha** | L95–131 (`INSERT … ON CONFLICT`) |
| **Condição** | Chamada **somente** a partir de `insertOrReactivateRenewalJob` quando scheduler/manual enqueue garante job para um `cycle_key` (= `next_billing_date` canonical) |

Caller chain do **novo** ciclo:

```
start.bat loop 60s
  npm run billing:scheduler
    runRecurringScheduler.ts → enqueueRenewalJobs()
      insertOrReactivateRenewalJob(pool, joinRow)     // joinRow.next_billing_date = C+1
        subscriptionCyclesUpsertAfterScheduler(...)   // INSERT subscription_cycles C+1
```

Ou, após PATCH de `next_billing_date`:

```
crmSubscriptionsLifecycleService / customerInvoiceRecurrenceNextBillingService
  tryEnqueueRenewalJobForSubscriptionId(sub.id)
    insertOrReactivateRenewalJob
      subscriptionCyclesUpsertAfterScheduler
```

**Não** é criado por: `advanceSubscriptionAfterCompletedCycle`, `validateBillingRuntime`, `repairRecoverableSubscriptionCycles` (só UPDATE failed→pending).

### Evidência runtime (trace SQL)

Arquivo: `storage/debug/billing-runtime/runtime-2026-07-03T20-57-22-064Z.json`

Sequência observada para `subscription_id=bf6683bb-9975-4138-9e5b-05627e612363`:

1. `2026-07-03T20:57:22` — GET dispara `validateBillingRuntime` (UPDATE failed→pending em cycles/jobs — reparo, **sem INSERT**)
2. `2026-07-03T20:57:22.100` — **INSERT** `subscription_cycles` `cycle_date=2026-07-16`, `status=queued`, metadata `"dual_write":"scheduler"`
3. `2026-07-03T20:57:28` — segundo INSERT idempotente (ON CONFLICT) + UPDATE job pending

Isso ocorre **segundos depois** de activity de GET/repair — consistente com tick do scheduler (`start.bat` L87–90: loop **60s**), **não** com corpo síncrono do POST manual.

Trace anterior (`runtime-2026-07-03T17-00-57-614Z.json`) mostra o mesmo padrão: INSERT com `"dual_write":"scheduler"`, `cycle_due_date=2026-07-09`, `generation_date=2026-07-03`.

---

## 4. Workers / filas / tempo

### Infraestrutura billing (sem Bull/Redis)

| Mecanismo | Existe? | Detalhe |
|-----------|---------|---------|
| **Bull / BullMQ / Redis queue** | **NÃO** | grep em `packages/backend/src/services/*billing*` = 0 hits |
| **Fila** | **SIM** | Tabela PostgreSQL `billing_recurring_jobs` (`status`: pending → processing → completed) |
| **Scheduler** | **SIM** | `runRecurringScheduler.ts` → `enqueueRenewalJobs()` |
| **Worker** | **SIM** | `runRecurringWorker.ts` → `processNextBatch()` |
| **Cron externo** | Opcional | Docs sugerem cron 10–15 min; dev usa `start.bat` |
| **Polling API** | Parcial | `index.ts`: `syncOverdueBillingStatuses` a cada ~5 min — **não** cria cycles |

### Dependência de tempo

| Processo | Intervalo | Efeito em cycles |
|----------|-----------|------------------|
| Billing Scheduler (`start.bat`) | **60 s** | Enfileira jobs elegíveis → **INSERT** `subscription_cycles` C+1 |
| Billing Worker (`start.bat`) | **15 s** | Processa jobs já enfileirados |
| `enqueueRenewalJobs` janela | `generation_date = next_billing_date − tenant_days_before_due ≤ CURRENT_DATE` + horário local tenant | Decide **quando** C+1 entra na fila |
| API `index.ts` startup | **NÃO** dispara scheduler/worker de renewal | Só overdue-sync, notifications, etc. |

### Job enfileirado no POST manual?

**Sim, mas só para o ciclo C (corrente), não para C+1.**

```
ensureJobForManualGenerate
  → insertOrReactivateRenewalJob(pool, enqueueJoin)   // enqueueJoin.next_billing_date = C (antes do advance)
  → runSynchronousManualPipeline
      → executeRenewalJobSynchronously(jobId)         // executa **inline**, não delega ao worker loop
```

Payload típico do job:

```json
{
  "subscription_id": "<uuid>",
  "tenant_id": "<uuid>",
  "job_type": "renewal",
  "cycle_key": "2026-07-09",
  "status": "pending → completed",
  "scheduled_at": "now()"
}
```

**Nenhum** segundo job é inserido para `2026-07-16` ao fim do POST.

### Fluxo POST → enqueue → worker → INSERT (C+1)

```
POST manual-renew
  → job C: insertOrReactivateRenewalJob + execução síncrona
  → advance next_billing_date para C+1
  → COMMIT
  → (gap: sem cycle row C+1)

… até 60s ou janela elegível …

Scheduler tick
  → enqueueRenewalJobs()
  → INSERT billing_recurring_jobs (cycle_key = C+1)
  → subscriptionCyclesUpsertAfterScheduler → INSERT subscription_cycles (C+1, queued)

Worker tick (15s)
  → processNextBatch (quando job C+1 pending e janela OK)
  → (faturamento futuro; não é o que restaura o botão Gerar — basta o **cycle row** pending/queued)
```

---

## 5. Bootstrap no restart do backend

**Pergunta:** restart executa `ensureRenewal` / `repairCycles` / `schedulerTick` / `billingBootstrap`?

**Resposta: NÃO** (no processo API).

`packages/backend/src/index.ts` — intervalos no startup:

- `syncOverdueBillingStatuses` (~5 min) — status overdue em invoices
- notification retries, trial expiring, announcements, agenda
- **Ausente:** `enqueueRenewalJobs`, `processNextBatch`, `validateBillingRuntime` global

`validateBillingRuntime` roda **por GET** de assinatura (`getCrmSubscriptionDetail` L397), não no boot.

`repairRecoverableSubscriptionCycles` (dentro do validator) faz apenas:

```27:39:packages/backend/src/services/subscriptionCycleRepairService.ts
      `UPDATE subscription_cycles
       SET status = 'pending', ...
       WHERE ... status = 'failed' AND invoice_id IS NULL AND cycle_date >= $3::date`
```

**Sem INSERT** de novo cycle.

Por que “restart” parece curar:

1. **`start.bat`** relança janelas **Billing Scheduler** (60s) e **Worker** (15s) — não só API.
2. Tempo passa → scheduler enfileira C+1 → INSERT cycle.
3. Utilizador recarrega → GET traz `cycles_raw` com linha real → botão Gerar volta (Sprint 22B: oculto quando `next.isProjected === true`).

---

## 6. GET `/crm-subscriptions/:id` — payload imediato vs pós-scheduler

### Montagem

```344:443:packages/backend/src/services/crmSubscriptionsService.ts
export async function getCrmSubscriptionDetail(...) {
  ...
  const cycles = cyclesRead ? await listSubscriptionCyclesBySubscriptionId(...) : [];
  ...
  const runtime_validation = await validateBillingRuntime(tenantId, subscriptionId);
  const timeline = buildSubscriptionTimeline(cycles, invRows, ...);
  ...
  return { subscription, timeline, cycles_raw: cycles, invoices, recent_jobs, runtime_validation, ... };
}
```

- **Sem cache** de repositório — `pg.Pool` default (PostgreSQL **READ COMMITTED** implícito; pool não define isolation level custom).
- **Sem memoização** no endpoint.
- `runtime_validation` pode reparar failed→pending; **não** cria C+1.

### Diff esperado (campos-chave)

| Campo | GET imediato pós-Generate | GET após scheduler |
|-------|---------------------------|---------------------|
| `subscription.next_billing_date` | **C+1** (já avançado no POST) | Igual |
| `cycles_raw` | C=`invoiced`; **sem** linha C+1 | **+1 row** C+1 `pending`/`queued` |
| `invoices` | +1 invoice ciclo C | Igual (até worker faturar C+1) |
| `timeline` | evento real C + **projeção** C+1 | evento **real** C+1 substitui projeção |
| `recent_jobs` | job C `completed` | + job C+1 `pending` |
| `runtime_validation.issues` | possível warning “cycle ahead of rows” | tende a `certified: true` |
| `capabilities` / `nextInvoice` (front) | `next.isProjected=true` → **sem Gerar** | `isProjected=false` + cycle elegível → **Gerar** |

Quem alterou os dados entre os dois GETs: **Billing Scheduler** (`enqueueRenewalJobs` → dual-write), **não** o frontend nem cache HTTP.

### Frontend após Generate

```192:194:src/pages/SubscriptionDetail.tsx
        if (result.success) {
          toast.success(...);
          await load();   // GET fresco
```

---

## 7. SQL trace — timeline T0→T4

| Etapa | subscription_cycles | billing_recurring_jobs | subscriptions | customer_invoices |
|-------|---------------------|------------------------|---------------|-------------------|
| **T0** Antes Generate | C pending/queued | job C pending | next=C | invoices < C |
| **T1** POST em flight | UPSERT C queued; depois C invoiced | INSERT/UPDATE C; complete | — | INSERT invoice C |
| **T2** POST commit | C invoiced; **no row C+1** | job C completed | next=**C+1** | +invoice C |
| **T3** GET imediato | SELECT — mesmo T2 | SELECT jobs | SELECT sub | SELECT invoices |
| **T4** Scheduler (~≤60s) | **INSERT C+1** queued | INSERT job C+1 pending | unchanged | unchanged |
| **T5** GET pós-scheduler | SELECT inclui C+1 | job C+1 pending | unchanged | unchanged |

Queries registradas em `storage/debug/billing-runtime/runtime-*.json` (`kind: sql_write`).

---

## 8. Cache / isolamento / stale GET

| Mecanismo | Billing GET afetado? |
|-----------|---------------------|
| READ COMMITTED (PG default) | Não explica lag — POST commit visível no GET seguinte |
| REPEATABLE READ explícito | **Não usado** no pool |
| Repository cache | **Não** |
| HTTP cache (`apiClient`) | **Não** (investigação 22C) |
| React Query stale | **Não** — `useState` + `load()` |

Conclusão item 14: **GET desatualizado por cache não é a causa**. O payload está correto para o estado real do DB (sem linha C+1).

---

## 9. Respostas rápidas — checklist auditoria

| # | Pergunta | Resposta |
|---|----------|----------|
| 1 | Call graph POST | Seção 1 |
| 2 | Novo cycle após POST? | **NÃO** |
| 3 | `manualGenerateRenewalNow` chama `tryEnqueue…` / `subscriptionCyclesEnsure` / `createNextCycle`? | **NÃO** (só `insertOrReactivateRenewalJob` para ciclo **atual**) |
| 4 | Quem cria C+1? | **Scheduler** (`enqueueRenewalJobs`) |
| 5 | Onde nasce row? | `subscriptionCyclesUpsertAfterScheduler` L95, via `insertOrReactivateRenewalJob` |
| 6 | Workers? | PG queue + `runRecurringScheduler` + `runRecurringWorker`; sem Bull/Redis |
| 7 | Job enfileirado no POST? | Job **C** sim (inline sync); job **C+1** **não** |
| 8 | Fila POST→worker→INSERT C+1? | **Não no POST**; só scheduler posterior (Seção 4) |
| 9 | Dependência tempo? | Scheduler **60s** (`start.bat`); janela `generation_date` |
| 10 | Restart API bootstrap renewal? | **NÃO** |
| 11 | Diff payload | Seção 6 |
| 12 | Quem altera entre GETs? | **Scheduler** dual-write |
| 13 | SQL trace | Seção 7 + `storage/debug/billing-runtime/` |
| 14 | Cache stale? | **NÃO** |
| 15 | GET faz repair/ensure cycle insert? | Repair UPDATE only; **sem INSERT** novo cycle |

---

## 10. Timeline runtime completa

```
T0  UI: clique Gerar próxima cobrança
      ↓
T1  POST /api/crm-subscriptions/:id/manual-renew
      postCrmSubscriptionManualRenewHandler
      ↓
T2  ensureJobForManualGenerate
      INSERT/UPDATE billing_recurring_jobs (ciclo C)
      subscriptionCyclesUpsertAfterScheduler (C → queued)
      ↓
T3  executeRenewalJobSynchronously → processNextBatch (manual)
      BillingExecutionOrchestrator
      INSERT customer_invoices (+ items)
      advanceSubscriptionCycle → UPDATE subscriptions.next_billing_date = C+1
      completeBillingRecurringJob → subscription_cycles C = invoiced
      ↓
T4  COMMIT → HTTP 200 { success, invoice_id, job_id, cycle_key: C }
      ↓
T5  GET imediato (load())
      cycles_raw: [C invoiced] — sem C+1
      subscription.next_billing_date: C+1
      UI: projeções; botão Gerar oculto (next.isProjected)
      ↓
T6  (gap 0–60s+) Billing Scheduler tick
      enqueueRenewalJobs → insertOrReactivateRenewalJob(C+1)
      INSERT subscription_cycles (C+1, queued) + billing_recurring_jobs
      ↓
T7  GET (reload ou após tempo)
      cycles_raw inclui C+1 pending/queued
      UI: cycle real; botão Gerar visível
```

---

## 11. Implicação para produto (informacional — fora do escopo de fix)

O POST manual completa o ciclo **C** e avança a assinatura, mas **não** replica o pós-avanço do scheduler (`tryEnqueueRenewalJobForSubscriptionId`), que hoje é o **único** caminho que materializa C+1 em `subscription_cycles` quando a assinatura já está na janela de geração.

Correção arquitetural natural (não implementada neste sprint): após `advanceSubscriptionAfterCompletedCycle` no pipeline manual, chamar `tryEnqueueRenewalJobForSubscriptionId(subscriptionId)` — mesmo padrão já usado em `crmSubscriptionsLifecycleService.ts` L143 e `customerInvoiceRecurrenceNextBillingService.ts` L82 após PATCH de datas.

---

## 12. Fontes

| Tipo | Path |
|------|------|
| POST handler | `packages/backend/src/controllers/crmSubscriptionsController.ts` |
| Manual pipeline | `packages/backend/src/services/billingManualRenewalService.ts` |
| Cycle-scoped entry | `packages/backend/src/services/billingCycleInvoiceGenerationService.ts` |
| Job enqueue + scheduler | `packages/backend/src/services/recurringBillingJobService.ts` |
| Cycle dual-write | `packages/backend/src/services/subscriptionCyclesDualWriteService.ts` |
| Advance (subscriptions only) | `packages/backend/src/services/billingRecurringJobPersistence.ts` |
| Orchestrator | `packages/backend/src/billingExecution/billingExecutionOrchestrator.ts` |
| GET detail | `packages/backend/src/services/crmSubscriptionsService.ts` |
| Runtime validator | `packages/backend/src/billingRuntime/billingRuntimeValidator.ts` |
| Dev scheduler loop | `start.bat` L87–96 |
| SQL traces | `storage/debug/billing-runtime/runtime-*.json` |
| UI refresh | `src/pages/SubscriptionDetail.tsx` |
| Generate visibility | `docs/billing/GENERATE_BUTTON_INVESTIGATION_22B.md` |

---

**Hash evidência runtime (amostra):** `runtime-2026-07-03T20-57-22-064Z.json` — INSERT `subscription_cycles` `2026-07-16` + metadata `dual_write:scheduler` após GET/repair, não intercalado com trace de POST manual neste arquivo.
