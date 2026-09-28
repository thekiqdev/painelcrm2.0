# Billing Aggregate Certification — Sprint 4.2Q

**Mode:** READ ONLY — no code, DB, API, frontend, backend, test, or commit changes  
**Date:** 2026-07-02  
**Cross-references:** [BILLING_STATE_MACHINE_BLUEPRINT.md](./BILLING_STATE_MACHINE_BLUEPRINT.md) (4.2P), [BILLING_ARCHITECTURE_SIMPLIFICATION_AUDIT.md](./BILLING_ARCHITECTURE_SIMPLIFICATION_AUDIT.md) (4.2O), [BILLING_TIMELINE_CAUSALITY_AUDIT.md](./BILLING_TIMELINE_CAUSALITY_AUDIT.md) (4.2N), [BILLING_RUNTIME_CAUSALITY_AUDIT.md](./BILLING_RUNTIME_CAUSALITY_AUDIT.md) (4.2M)

**Goal:** Certificar definitivamente a existência (ou não) de um único `BillingAggregate` oficial; localizar quem monta, enriquece, modifica ou reconstrói o agregado consumido pela camada de apresentação.

---

## Conclusão única

| Pergunta | Resposta | Evidência |
|----------|----------|-----------|
| Existe `BillingAggregate` explícito hoje? | **NÃO** | `grep BillingAggregate` / `buildBillingAggregate` → 0 ocorrências no repositório |
| Existe agregado implícito? | **SIM** | `CrmSubscriptionDetailPayload` (`crmSubscriptions.ts:110–202`) |
| Existe apenas um Aggregate Builder? | **NÃO — PROVEN** | Mínimo **7 construtores/enriquecedores** distintos (Tabela 1) |
| Todos os consumidores podem usar o mesmo agregado? | **NÃO hoje** | Sidebar, Renewal Card e experience layer consultam estruturas paralelas |
| Existe reconstrução paralela? | **SIM — PROVEN** | `normalizeDetailForBillingStateMachine`, múltiplos `createFinancialEventStore` |
| Billing 5.0 tem builder canônico hoje? | **NÃO** | Proposto em 4.2P; **não implementado** |

**Veredito:** O sistema atual **não possui** um `BillingAggregate` oficial único. O substituto de fato é `CrmSubscriptionDetailPayload`, montado no backend e **re-enriquecido/reconstruído** no frontend antes de alimentar `FinancialEventStore`. Invoices não existem como coleção no payload — apenas fundidas em `timeline[]` (`crmSubscriptionsService.ts:325–364`, `subscriptionTimelineUx.ts:491–547`).

---

## Respostas às 20 perguntas obrigatórias

### 1. Existe hoje um BillingAggregate explícito ou implícito?

- **Explícito:** **Não.**
- **Implícito:** **`CrmSubscriptionDetailPayload`** — tipo TypeScript em `src/services/crmSubscriptions.ts:110–202`, populado por `GET /api/crm-subscriptions/:id`.

### 2. Quem é o primeiro módulo que começa a montar o Aggregate?

**`getCrmSubscriptionDetail`** em `packages/backend/src/services/crmSubscriptionsService.ts:301` — primeiro ponto que reúne subscription, invoices (query), cycles, jobs, lifecycle, stats, runtime.

### 3. Quem adiciona subscription_cycles?

**`listSubscriptionCyclesBySubscriptionId`** → campo `cycles_raw` em `getCrmSubscriptionDetail` (`crmSubscriptionsService.ts:337`, `392`).

### 4. Quem adiciona invoices?

**`listInvoicesForSubscription`** (`crmSubscriptionsService.ts:325`) — **não** exposto como array no payload. Invoices entram via **`buildSubscriptionTimeline(cycles, invRows, …)`** (`356–364`) como linhas `merge_source: 'cycle' | 'invoice_only'`.

### 5. Quem adiciona recurring_jobs?

**`listRecentJobsForSubscription`** → `recent_jobs[]` (`350`, `395`). Também embutidos em linhas timeline via `findJobForRow` (`subscriptionTimelineUx.ts:508–516`).

### 6. Quem adiciona lifecycle_events?

**`getSubscriptionLifecycleEventsForTimeline`** → consumido por `buildSubscriptionTimeline` → linhas `operational_state: 'lifecycle_event'` (`crmSubscriptionsService.ts:352`, `subscriptionTimelineUx.ts:397`).

### 7. Quem adiciona timeline?

**`buildSubscriptionTimeline`** (`subscriptionTimelineUx.ts:491`) dentro de `getCrmSubscriptionDetail` (`356–364`). **Segunda escrita:** `normalizeDetailForBillingStateMachine` reescreve `timeline[]` in-memory (`billingStateMachine.ts:318–330`).

### 8. Quem adiciona projection?

**Não está no payload API.** **`buildProjectionEvents(detail)`** no construtor de `FinancialEventStore` (`subscriptionFinancialEventStore.ts:106–108`, `subscriptionFinancialProjection.ts:39–77`).

### 9. Quem adiciona capabilities?

**Não existe campo capabilities no agregado.** Calculado em runtime:

| Capability | Onde |
|------------|------|
| `canGenerateNow` | `cycleSupportsManualGenerate` em `getHistoryRows` (`subscriptionFinancialEventStore.ts:169,175`) |
| `supportsGenerate` | `resolveInvoiceCapabilities` (`invoiceCapabilities.ts:57–80`) — componentes calendário |
| `can_generate_now` | API separada `getManualRenewalStatus` (`SubscriptionRenewalActionsCard.tsx:62`) |

### 10. Quem adiciona diagnósticos?

| Fonte | Campo / função |
|-------|----------------|
| Backend | `validateBillingRuntime` → `runtime_validation` (`crmSubscriptionsService.ts:354`, `397`) |
| Backend | `buildSubscriptionAutomationSummary` → `automation_summary` (`372–380`) |
| Frontend | `buildTechnicalDiagnostics(detail)` (`billingSubscriptionExperience.ts:783–808`) |

### 11. Existe mais de um Aggregate Builder?

**SIM — PROVEN.** Ver Tabela 1 (mínimo 7).

### 12. Existe algum Aggregate parcial?

**SIM — PROVEN:**

| Agregado parcial | Conteúdo |
|------------------|----------|
| `CrmSubscriptionManualRenewalStatus` | Diagnóstico renovação (`crmSubscriptions.ts:340–357`) |
| `detail.timeline` sem `cycles_raw` invertível 1:1 | Invoice join só na timeline |
| `FinancialEventStore` | `detail` + `realEvents` + `events` (projeção) |
| `buildCalendarMonths(detail)` | Calendário experience só timeline (`billingSubscriptionExperience.ts:335–399`) |
| `buildFinancialSummary(detail)` | KPIs só timeline + stats (`516–549`) |

### 13. Existe algum Aggregate reconstruído posteriormente?

**SIM — PROVEN:**

1. `normalizeDetailForBillingStateMachine` — cópia de `detail` com `timeline` alterada (`billingStateMachine.ts:318–330`).
2. `FinancialEventStore` — reconstruído quando `financialEventStoreSignature(detail)` muda (`FinancialEventStoreContext.tsx:30–40`).
3. `createFinancialEventStore` chamado independentemente em `buildFinancialHistoryRows` (`billingSubscriptionExperience.ts:509–513`) — **nova instância** por chamada.

### 14–18. Aggregate diferente por superfície?

| Superfície | Mesmo agregado? | Evidência |
|------------|-----------------|-----------|
| **Calendar** (financial tab) | Usa `FinancialEventStore` do Provider | `FinancialCalendar.tsx:53–59` — `store.getEventsForMonth` |
| **History** | Mesmo store | `FinancialHistory.tsx` via `useFinancialEventStore` |
| **Next Invoice** | Store + **`detail` prop paralelo** | `NextInvoiceCard.tsx:31–42` — guards em `detail.subscription.status` |
| **Sidebar** | Store + **`buildFinancialAlerts(detail)`** timeline direto | `FinancialSummarySidebar.tsx:48–50` |
| **Timeline** | (a) Store `getTimelineItems()` de eventos; (b) `detail.timeline` em painéis legados | `subscriptionFinancialEventStore.ts:222–237`; `SubscriptionOperationalTimelinePanel.tsx:201` |

**Calendário experience legado** (`buildCalendarMonths`) é agregado **diferente** do `FinancialCalendar` — **NOT PROVEN** se ainda montado em `SubscriptionDetail` (imports experience existem mas financial tab usa store — `SubscriptionDetail.tsx:513–521`).

### 19. FinancialEvent é construído a partir de um único Aggregate ou estruturas paralelas?

**Estruturas paralelas — PROVEN.**

`buildFinancialEvents` (`subscriptionFinancialEventBuilder.ts:249–264`):

1. `normalizeDetailForBillingStateMachine(detail)` — agregado mutado
2. `listCyclesFromDetail(normalized)` — `cycles_raw`
3. `timelineRowForCycle(normalized, cycle)` — **prioriza `detail.timeline`** sobre cycle (`subscriptionCyclesSource.ts:69–90`)
4. `emitEventsForCycleRow(..., row)` — campos invoice/gateway de **linha timeline**

`buildProjectionEvents` usa adicionalmente `detail.subscription.next_billing_date` + `buildFutureCycles(detail)` (`subscriptionFinancialProjection.ts:39–46`) — não passa pelo timeline.

### 20. Quais módulos quebrariam se existisse apenas um Aggregate oficial (com invoices[] explícito, sem decisão via timeline)?

| Módulo | Motivo |
|--------|--------|
| `buildFinancialEvents` / `emitEventsForCycleRow` | Depende de `timelineRowForCycle` |
| `normalizeDetailForBillingStateMachine` | Reescreve timeline |
| `buildFinancialAlerts` | Loop `detail.timeline` (`subscriptionFinancialExperience.ts:397`) |
| `buildFinancialMonthOverview` | `detail.timeline.filter` (`subscriptionFinancialConsistency.ts:112`) |
| `buildFinancialSummary` | `detail.timeline` (`billingSubscriptionExperience.ts:518–532`) |
| `buildCalendarMonths` | `detail.timeline` (`billingSubscriptionExperience.ts:339`) |
| `buildBusinessTimelineEvents` | `detail.timeline` (`412+`) |
| `buildTechnicalDiagnostics` | `detail.timeline.find` (`788`) |
| `resolveNextChargePresentation` | `detail.timeline.find` (`142–144`) |
| `financialEventStoreSignature` | Hash de campos timeline (`452–457`) |
| `subscriptionHeadlineStatus` | `detail.timeline` (`billingSubscriptionExperience.ts:339`) |
| `getKpiCards` no store | Chama `subscriptionHeadlineStatus(this.detail)` (`288`) |
| Backend `buildSubscriptionTimeline` | Deixa de ser input de negócio; vira projeção |

**Não quebrariam** (já usam `cycles_raw` ou API engine): `executeDeterministicGenerateRenewal`, worker backend, `cycleSupportsManualGenerate` (lógica migrável para capabilities no aggregate).

---

## Tabela 1 — Todos os Aggregate Builders encontrados

| # | Builder / Enriquecedor | Arquivo | Entrada | Saída | Papel |
|---|------------------------|---------|---------|-------|-------|
| 1 | **`getCrmSubscriptionDetail`** | `crmSubscriptionsService.ts:301` | DB queries | `CrmSubscriptionDetail` (backend type) | **Builder primário API** |
| 2 | **`getCrmSubscription` controller** | `crmSubscriptionsController.ts:88–96` | detail + `crmSubscriptionMeta` | JSON response | Adiciona `meta` |
| 3 | **`buildSubscriptionTimeline`** | `subscriptionTimelineUx.ts:491` | cycles, invoices, jobs, lifecycle | `timeline[]` | Merge invoice→row; **não é aggregate root** mas é builder de sub-estrutura crítica |
| 4 | **`buildSubscriptionAutomationSummary`** | `subscriptionTimelineUx.ts:566` | timeline, jobs, subscription | `automation_summary` | Enriquecimento pós-timeline |
| 5 | **`validateBillingRuntime`** | `billingRuntimeValidator.ts:225` | tenant, subscription | `runtime_validation` | Diagnóstico engine |
| 6 | **`normalizeDetailForBillingStateMachine`** | `billingStateMachine.ts:318` | `CrmSubscriptionDetailPayload` | Cópia com `timeline` mutada | **Re-builder frontend** |
| 7 | **`FinancialEventStore` constructor** | `subscriptionFinancialEventStore.ts:99–108` | `detail`, `today` | `realEvents`, `events` | **Agregado derivado** (eventos) |
| 8 | **`buildCalendarMonths`** | `billingSubscriptionExperience.ts:335` | `detail.timeline` | `CalendarMonthGroup[]` | Builder paralelo (experience) |
| 9 | **`buildFinancialSummary`** | `billingSubscriptionExperience.ts:516` | `detail.timeline`, `stats` | `FinancialSummary` | Builder paralelo |
| 10 | **`getManualRenewalStatus`** | `billingManualRenewalService.ts:249` | DB direto | `CrmSubscriptionManualRenewalStatus` | **Aggregate API separado** |

**Certificação DoD:** **Não existe apenas um Aggregate Builder.**

---

## Tabela 2 — Campos adicionados em cada etapa

| Etapa | Campos adicionados |
|-------|-------------------|
| `getSubscriptionById` | `subscription.*` |
| `listInvoicesForSubscription` | usado internamente; `latest_invoice_id`, `latest_invoice_status`, `latest_paid_invoice_id`, `plan_label` |
| `computeStats` | `stats` |
| `listSubscriptionCyclesBySubscriptionId` | `cycles_raw`, `cycles_read_enabled` |
| `listRecentJobsForSubscription` | `recent_jobs` |
| `getPendingCrmSubscriptionContract` | `pending_contract` |
| `getSubscriptionLifecycleEventsForTimeline` | → dentro de `timeline[]` apenas |
| `buildSubscriptionTimeline` | `timeline[]` (+ `operational_state`, `invoice_status`, `merge_source`, job fields por linha) |
| `validateBillingRuntime` | `runtime_validation` |
| `buildSubscriptionAutomationSummary` | `automation_summary` |
| Controller `meta` | `meta.periodicity_label_pt` |
| `normalizeDetailForBillingStateMachine` | `timeline[].operational_state` / `cycle_status` reescritos |
| `FinancialEventStore` | `realEvents[]`, `events[]` (não no payload HTTP) |
| `buildProjectionEvents` | eventos `kind:'projected'` |
| `getHistoryRows` | `canGenerateNow` por linha (não no payload) |
| `getManualRenewalStatus` | `can_generate_now`, `generate_blockers`, `reprocess_job`, etc. |

---

## Tabela 3 — Enriquecimentos após construção inicial

| Ordem | Módulo | O que enriquece | Quando |
|-------|--------|-----------------|--------|
| 1 | `buildSubscriptionTimeline` | invoice + job → linha timeline | Backend, antes HTTP |
| 2 | `buildSubscriptionAutomationSummary` | resumo worker | Backend |
| 3 | `validateBillingRuntime` | observability | Backend |
| 4 | `crmSubscriptionMeta` | `meta` | Controller |
| 5 | `normalizeDetailForBillingStateMachine` | timeline legacy recovery | Frontend, em `buildFinancialEvents` |
| 6 | `timelineRowForCycle` | escolhe linha enriquecida vs `cycleToTimelineRow` | Por ciclo, em build events |
| 7 | `FinancialEventStore.getHistoryRows` | `canGenerateNow`, `statusPt` via `resolveHistoryRowState` | Lazy cache |
| 8 | `buildFinancialAlerts` | alertas sidebar | Render `FinancialSummarySidebar` |
| 9 | `buildTechnicalDiagnostics` | accordion técnico | Render `FinancialTechnicalAccordion` |
| 10 | `buildFinancialInsights` | insights | Store `getInsights` |
| 11 | `getRenewalDiagnosis` | status renovação | Mount `SubscriptionRenewalActionsCard` |

---

## Tabela 4 — Consumidores do agregado (implícito)

| Consumidor | Estrutura lida | Caminho |
|------------|----------------|---------|
| `FinancialEventStoreProvider` | `CrmSubscriptionDetailPayload` | `detail` prop |
| `FinancialCalendar` | store (+ `detail` para mês default) | `store.getEventsForMonth` |
| `FinancialHistory` | store | `store.filterHistory` |
| `NextInvoiceCard` | store + `detail` | `resolveNextChargePresentationFromStore` + status guards |
| `FinancialSummarySidebar` | store + **`detail.timeline`** via alerts | `buildFinancialAlerts(detail)` |
| `UpcomingPaymentsList` | store + `cycleSupportsManualGenerate(store.detail)` | `UpcomingPaymentsList.tsx:150` |
| `FinancialInsights` | store | `getInsights` |
| `FinancialTechnicalAccordion` | `detail` (+ store opcional) | `runtime_validation`, `buildTechnicalDiagnostics` |
| `SubscriptionRenewalActionsCard` | **`CrmSubscriptionManualRenewalStatus`** | API separada |
| `SubscriptionOperationalTimelinePanel` | `detail.timeline` | Direto |
| Experience components | `detail.timeline` / `buildCalendarMonths` | Legado — **NOT PROVEN** em rota ativa principal |
| `executeDeterministicGenerateRenewal` | `detail` (cycle_id) | Geração HTTP |
| Testes (~25 arquivos) | fixtures `detail()` | Múltiplos `createFinancialEventStore` |

---

## Tabela 5 — Estruturas paralelas ainda existentes

| Estrutura | SSOT declarado | SSOT real | Conflito |
|-----------|----------------|-----------|----------|
| `cycles_raw[]` | Sprint 4.2G (`subscriptionCyclesSource.ts:1–4`) | Sim para Gerar API | vs timeline em eventos |
| `timeline[]` | UX (`subscriptionTimelineUx.ts:1–3`) | Usado em decisão frontend | vs cycles_raw (4.2N) |
| `FinancialEvent[]` | UI financeira | Derivado de cycles+timeline | 0 eventos/ciclo possível (4.2M) |
| `stats` | DB agregado invoices | Independente de timeline | vs KPIs timeline em `buildFinancialSummary` |
| `recent_jobs[]` | DB | Também em timeline rows | Duplicado |
| `runtime_validation` | Engine validator | Diagnóstico separado | vs `automation_summary` |
| `CrmSubscriptionManualRenewalStatus` | API renewal | Backend only | vs `canGenerateNow` frontend |
| `buildCalendarMonths` events | Experience | Só timeline | vs `FinancialEventStore` calendar |
| Projeção `kind:'projected'` | 4.2H UX | `next_billing_date` | `cycleId: null` |

---

## Tabela 6 — Aggregate atual vs Aggregate ideal (4.2P)

| Aspecto | Atual (`CrmSubscriptionDetailPayload`) | Ideal (`BillingAggregate` 5.0) |
|---------|----------------------------------------|--------------------------------|
| Nome explícito | Não | `BillingAggregate` |
| `invoices[]` | **Ausente** — só em timeline | `invoicesById` ou array |
| `lifecycle_events[]` | Só em timeline | Campo dedicado |
| `timeline[]` | Input de negócio | Projeção read-only |
| `capabilities` | Calculado em 3 lugares | Embedded em `FinancialEvent` |
| Builders | ≥7 | **1** `buildBillingAggregate` |
| Mutação frontend | `normalizeDetailForBillingStateMachine` | Proibida |
| Projeção | Store constructor | Submódulo do pipeline |
| Renewal diagnosis | API paralela | Capability ou campo no aggregate |
| Invariante ciclo→evento | Não garantido | Obrigatório (4.2P) |

---

## Mapa completo do Aggregate (atual)

```
┌─────────────────────────────────────────────────────────────────────────┐
│ DATABASE                                                                 │
│  subscriptions │ subscription_cycles │ customer_invoices │              │
│  billing_recurring_jobs │ subscription_change_events                    │
└───────────────────────────────┬─────────────────────────────────────────┘
                                │
                    getCrmSubscriptionDetail (BUILDER #1)
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
   subscription            cycles_raw[]            recent_jobs[]
   stats                   timeline[] ◄── invoices merged here
   automation_summary      (lifecycle rows)
   runtime_validation
   pending_contract
        │
        ▼ HTTP GET
   + meta (controller BUILDER #2)
        │
        ▼
 CrmSubscriptionDetailPayload  ◄── AGREGADO IMPLÍCITO ATUAL
        │
        ├─► normalizeDetailForBillingStateMachine (RE-BUILDER #6)
        │         │
        │         ▼
        ├─► buildFinancialEvents ──► realEvents[]
        ├─► buildProjectionEvents ──► projectedEvents[]
        │         │
        │         ▼
        └─► FinancialEventStore (DERIVED AGGREGATE #7)
                  │
                  ├─► History / Calendar / Timeline(items) / KPIs / Insights
                  │
        PARALLEL (não passam pelo store):
                  ├─► buildFinancialAlerts(detail.timeline) → Sidebar
                  ├─► buildTechnicalDiagnostics(detail) → Accordion
                  └─► getRenewalDiagnosis() → Renewal Card (API #10)

LEGACY PARALLEL:
                  ├─► buildCalendarMonths(detail.timeline)
                  ├─► buildFinancialSummary(detail.timeline)
                  └─► buildBusinessTimelineEvents(detail.timeline)
```

---

## Blueprint do Aggregate oficial (especificação alvo — não implementada)

Consolidado de 4.2P; **NOT PROVEN** como código existente:

```typescript
type BillingAggregate = {
  subscriptionId: string;
  subscription: SubscriptionSnapshot;
  cycles: SubscriptionCycleRaw[];
  invoicesById: Map<string, InvoiceSnapshot>;
  jobsByCycleKey: Map<string, JobSnapshot>;
  lifecycleEvents: LifecycleEventSnapshot[];
  tenantBilling: TenantBillingSnapshot;
  clientName: string | null;
  stats: CrmSubscriptionStats;
  automationSummary: AutomationSummarySnapshot;
  runtimeValidation: RuntimeValidationSnapshot;
  pendingContract: PendingContractSnapshot | null;
  builtAt: string;
  // timeline?: TimelineRow[]  — opcional, derivada, NUNCA input de decisão
};
```

**Builder canônico único (alvo):** `buildBillingAggregate(apiPayload): BillingAggregate`

**Pipeline canônico (alvo):** `aggregate → BillingPresentationStateMachine → BillingFinancialEventPipeline → FinancialEvent[]`

---

## Trace 1 — Construção completa do Aggregate

```
DB
 → getCrmSubscriptionDetail (crmSubscriptionsService.ts:301)
     → parallel: client, invRows, stats, cyclesRead, tenant
     → cycles = listSubscriptionCyclesBySubscriptionId
     → recent_jobs = listRecentJobsForSubscription
     → lifecycle_events = getSubscriptionLifecycleEventsForTimeline
     → runtime_validation = validateBillingRuntime
     → timeline = buildSubscriptionTimeline(cycles, invRows, jobs, lifecycle)
     → automation_summary = buildSubscriptionAutomationSummary({ timeline, recentJobs, ... })
     → return { subscription, cycles_raw, timeline, recent_jobs, stats, ... }
 → getCrmSubscription controller
     → res.json({ ...detail, meta: crmSubscriptionMeta })
 → crmSubscriptionsService.getById (frontend)
     → setDetail(d) in SubscriptionDetail.tsx:142
```

---

## Trace 2 — GET subscription detail → primeiro Aggregate

```
GET /api/crm-subscriptions/:id
  → getCrmSubscription (crmSubscriptionsController.ts:79)
  → getCrmSubscriptionDetail (crmSubscriptionsService.ts:301)
  → JSON = CrmSubscriptionDetailPayload

Primeiro objeto agregado no cliente: state `detail` em SubscriptionDetail (linha 142).
Não há transformação até FinancialEventStoreProvider montar.
```

---

## Trace 3 — Aggregate → FinancialEvent

```
CrmSubscriptionDetailPayload (detail)
  → FinancialEventStoreProvider (FinancialEventStoreContext.tsx:35)
      → createFinancialEventStore(detail, todayYmd)
          → buildFinancialEvents(detail, today)
              → normalized = normalizeDetailForBillingStateMachine(detail)  ★ re-aggregate
              → for cycle in listCyclesFromDetail(normalized):
                    row = timelineRowForCycle(normalized, cycle)  ★ parallel structure
                    emitEventsForCycleRow(..., row)
          → buildProjectionEvents(detail, today)
          → mergeRealAndProjectionEvents
  → realEvents[], events[]
```

---

## Trace 4 — Aggregate → History

```
detail
  → FinancialEventStore
  → getHistoryRows() (subscriptionFinancialEventStore.ts:152)
      → dedupe realEvents by cycleKey
      → financialEventToHistoryRow(ev, today, { canGenerateNow: cycleSupportsManualGenerate(detail, ev.cycleId) })
      → resolveHistoryRowState(row) → statusPt
  → FinancialHistory → FinancialHistoryRow (render canGenerateNow && !isProjected)
```

**Não usa aggregate separado** — usa store único do Provider. **Enriquecimento extra:** `canGenerateNow` recalculado de `detail.cycles_raw`, não de eventos.

---

## Trace 5 — Aggregate → Calendar

```
detail
  → FinancialEventStore
  → getCalendarEvents() / getEventsForMonth(monthKey)
      → map events[] → FinancialCalendarEvent (visual mapping only)
  → FinancialCalendar
  → FinancialCalendarPopover
      → resolveInvoiceCapabilities({ eventType, cycleId, ... })  ★ capabilities paralelas
```

**Mesmo store** que History. **Capabilities** não vêm do aggregate.

---

## Trace 6 — Aggregate → Timeline

**Caminho A (financial tab — eventos):**

```
detail → FinancialEventStore → getTimelineItems() / getTimelineMonthGroups()
  → derivado de events[] (não de detail.timeline diretamente)
```

**Caminho B (operacional / legado):**

```
detail.timeline → SubscriptionOperationalTimelinePanel (render direto)
detail.timeline → buildBusinessTimelineEvents(detail)
```

**Dois traces de timeline coexistem — PROVEN.**

---

## Trace 7 — Aggregate → Next Invoice

```
detail
  → FinancialEventStore
  → resolveNextChargePresentationFromStore(store)
      → resolveNextChargePresentation(detail, store.events, today, store.realEvents)
          → resolveNextChargeEvent(billingEvents, detail)
          → resolveFirstEligibleCycle(detail)
          → detail.timeline.find(cycle_id)  ★ parallel for period_end
  → NextInvoiceCard
      → guards: detail.subscription.status === 'active', !next.isProjected, cycleId
```

**Store + consultas paralelas a `detail.timeline` e `detail.subscription`.**

---

## Trace 8 — Aggregate → Sidebar

```
detail (prop)
  → buildFinancialAlerts(detail)  ★ lê detail.timeline diretamente
  → humanizeFinancialAlerts(...)
  +
store
  → getSidebarSummary()  ★ deriva de realEvents + getNextChargePresentation()
  → FinancialSummarySidebar
```

**Dois inputs — PROVEN divergência potencial** entre alertas (timeline) e resumo (eventos).

---

## Análise obrigatória

### Pontos onde informações são adicionadas ao Aggregate

Listados na Tabela 2 e 3 (backend timeline merge, meta, normalize, store, alerts, diagnostics, renewal API).

### Pontos onde informações são perdidas

| Perda | Evidência |
|-------|-----------|
| Invoices como coleção no payload | `invRows` usado só em `buildSubscriptionTimeline`; não em `return` (`crmSubscriptionsService.ts:382–398`) |
| Invoice fields em `cycles_raw` | Só `invoice_id`; sem `invoice_status` |
| Lifecycle events estruturados | Apenas linhas timeline |
| Múltiplos eventos por ciclo no History | Dedupe `byCycle` em `getHistoryRows` (`156–163`) |
| Ciclos sem evento emitido | `emitEventsForCycleRow` pode emitir 0 (4.2M) |

### Pontos onde informações são recalculadas

| Recálculo | Onde |
|-----------|------|
| `operational_state` | Backend `resolveOperationalState` + frontend `normalizeTimelineRowForStateMachine` |
| `canGenerateNow` | Store `getHistoryRows` após `financialEventToHistoryRow` |
| `statusPt` History | `resolveHistoryRowState` |
| KPI / headline | `subscriptionHeadlineStatus(detail)` lê timeline |
| Projeções | `buildProjectionEvents` a cada store build |
| Signature invalidation | `financialEventStoreSignature` — timeline fields |

### Estruturas paralelas ainda consultadas

`detail.timeline`, `detail.cycles_raw`, `detail.stats`, `detail.recent_jobs`, `detail.runtime_validation`, `CrmSubscriptionManualRenewalStatus`, `buildFutureCycles(subscription)`, experience builders.

### Duplicação de Aggregate

| Duplicação | Tipo |
|------------|------|
| `getCrmSubscriptionDetail` + `normalizeDetailForBillingStateMachine` | Mesmo conceito, timeline divergente |
| `FinancialEventStore` Provider vs `createFinancialEventStore` em helpers | Múltiplas instâncias |
| `timeline[]` vs `cycles_raw[]` + invoice join | Dados redundantes com semântica diferente |
| `buildCalendarMonths` vs `FinancialEventStore` calendar | Dois calendários |
| `canGenerateNow` vs `can_generate_now` vs `supportsGenerate` | Três capabilities |

---

## Plano de consolidação (design only — sem implementação)

Referência 4.2P Fase 0–1:

1. **Introduzir `buildBillingAggregate`** — único ponto que normaliza API → estrutura com `invoicesById`, `jobsByCycleKey`, `lifecycleEvents`.
2. **Deprecar decisão via `timeline`** — timeline vira `projectTimeline(aggregate)`.
3. **Unificar store** — `FinancialEventStore` recebe `BillingAggregate` + `FinancialEvent[]` pré-construídos; proibir `createFinancialEventStore` solto em helpers.
4. **Migrar Sidebar** — `buildFinancialAlerts` → alertas derivados de `FinancialEvent[]`.
5. **Unificar Renewal** — `can_generate_now` como campo read-only no aggregate ou eliminar API paralela após paridade.
6. **Remover `normalizeDetailForBillingStateMachine`** — regras entram no SM compartilhado no build do aggregate.
7. **Invariante** — todo ciclo em `aggregate.cycles` produz ≥1 evento real.

---

## Definition of Done — certificação

| Critério | Status |
|----------|--------|
| Confirmar se existe apenas um Aggregate Builder | **FALHA** — ≥7 builders/enriquecedores |
| Todos os consumidores podem usar o mesmo Aggregate | **FALHA hoje** — Sidebar, Renewal, experience legado |
| Identificar reconstrução paralela | **OK** — normalize + múltiplos store |
| Identificar enriquecimento duplicado | **OK** — operational_state, capabilities, calendar |
| Especificação oficial BillingAggregate | **OK** — seção Blueprint (alvo 5.0) |

---

## Resposta objetiva final

**Não existe hoje um `BillingAggregate` oficial único.** Existe um **agregado implícito fragmentado** centrado em `CrmSubscriptionDetailPayload`, com:

- invoices **fundidas** na timeline (não expostas);
- **reconstrução** frontend da timeline antes de eventos;
- **agregado derivado** `FinancialEventStore` (único para History/Calendar do financial tab, mas não para Sidebar/Renewal);
- **builders paralelos** na experience layer.

A Billing 5.0 **requer** implementar `buildBillingAggregate` como único builder canônico (4.2P). Esta certificação confirma que o estado atual **não atende** esse requisito.

---

*Sprint 4.2Q — nenhum arquivo de código foi alterado.*
