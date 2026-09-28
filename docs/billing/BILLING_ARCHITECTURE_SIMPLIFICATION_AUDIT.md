# Billing Architecture Simplification Audit — Sprint 4.2O

**Mode:** READ ONLY — no code, DB, API, or frontend changes  
**Date:** 2026-07-02  
**Cross-references:** [BILLING_TIMELINE_CAUSALITY_AUDIT.md](./BILLING_TIMELINE_CAUSALITY_AUDIT.md) (4.2N), [BILLING_RUNTIME_CAUSALITY_AUDIT.md](./BILLING_RUNTIME_CAUSALITY_AUDIT.md) (4.2M), [BILLING_GENERATE_ACTION_FORENSIC.md](./BILLING_GENERATE_ACTION_FORENSIC.md) (4.2L), [BILLING_LIFECYCLE_FORENSIC.md](./BILLING_LIFECYCLE_FORENSIC.md) (4.2K)

**Goal:** Prove whether `detail.timeline` is still required for business decisions or can return to being exclusively a presentation layer, with `subscription_cycles` as the sole official billing state source.

---

## Conclusão única

**`detail.timeline` continua sendo parte da regra de negócio no frontend CRM — PROVEN.** Não é exclusivamente camada de apresentação hoje.

**Veredito arquitetural:** `subscription_cycles` **já é** a fonte oficial de estado para o **Billing Engine** (worker, jobs, geração manual no backend). A timeline deveria **voltar** a ser exclusivamente apresentação no CRM, mas **não pode ser removida da cadeia de decisão sem migração**, porque:

1. `emitEventsForCycleRow` decide quais `FinancialEvent` existem com base em `operational_state` e campos enriquecidos da **linha de timeline**, não de `cycles_raw` isolado (`subscriptionFinancialEventBuilder.ts:67–244`).
2. `timelineRowForCycle` **prioriza** `detail.timeline` sobre `cycleToTimelineRow(cycle)` (`subscriptionCyclesSource.ts:69–90`) — a linha enriquecida vence o ciclo cru.
3. Campos necessários para decisões (`invoice_status`, `gateway_status`, `has_auto_retry`, `generation_note`, `operational_state`) **não existem** em `cycles_raw` (`crmSubscriptionsService.ts:390–392` retorna `cycles_raw` sem join de invoice).
4. Linhas `merge_source: 'invoice_only'` e `'lifecycle'` existem **somente** na timeline (`subscriptionTimelineUx.ts:359`, `416`, `547`).
5. Existe **dual path** comprovado: `canGenerateNow` usa `cycles_raw.status` (`cycleSupportsManualGenerate`, `subscriptionCyclesSource.ts:59–67`); emissão de eventos usa `operational_state` da timeline (`4.2M`).

**O Billing Engine não quebraria** se a timeline saísse da regra de negócio — **PROVEN** (backend não consome `detail.timeline` para cobrança). **O painel financeiro CRM quebraria** (Histórico, Calendário, alertas, Próxima Cobrança derivada de eventos) até reconstituir os mesmos sinais a partir de `cycles_raw` + invoices + jobs.

---

## Arquitetura atual

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ DB                                                                          │
│  subscription_cycles ──┐                                                    │
│  customer_invoices ────┼──► getCrmSubscriptionDetail (crmSubscriptionsService│
│  billing_recurring_jobs┤         .ts:337–398)                               │
│  subscription_change_events (lifecycle) ──┘                                 │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                    buildSubscriptionTimeline (subscriptionTimelineUx.ts:491)
                    resolveOperationalState (subscriptionTimelineUx.ts:256)
                                    │
                                    ▼
              API payload: cycles_raw[], timeline[], recent_jobs[], …
                                    │
        ┌───────────────────────────┴───────────────────────────┐
        │ FRONTEND CRM                                              │
        │ normalizeDetailForBillingStateMachine (billingStateMachine│
        │   .ts:318) — reescreve timeline in-memory                 │
        │ listCyclesFromDetail → timelineRowForCycle (prioriza       │
        │   timeline) → emitEventsForCycleRow → FinancialEvent[]     │
        │ FinancialEventStore → Histórico / Calendário / Insights     │
        │ buildFinancialAlerts(detail.timeline) → Sidebar alertas   │
        │ cycleSupportsManualGenerate(cycles_raw) → Gerar (History) │
        │ buildProjectionEvents(cycles_raw dates only) → projeção UX  │
        └───────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ BILLING ENGINE (separado)                                                   │
│  subscription_cycles + billing_recurring_jobs + worker                       │
│  NÃO usa detail.timeline — PROVEN (grep backend services)                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Máquinas de estado concorrentes (5+):** documentadas em 4.2N — `resolveOperationalState` (backend), `resolveBillingCycleState` (backend + frontend), `cycleSupportsManualGenerate`, `resolveInvoiceCapabilities`, `normalizeTimelineRowForStateMachine`.

---

## Arquitetura simplificada (alvo)

```
subscription_cycles (SSOT estado billing)
    + customer_invoices (join por invoice_id ou API invoices[])
    + recent_jobs[] (já no payload)
    + lifecycle_events[] (novo campo API ou painel dedicado)
         │
         ▼
resolveCyclePresentation(cycle, invoice?, job?)  ← única função de “estado UX”
         │
         ├──► FinancialEvent[] (emit direto do cycle + joins)
         └──► timeline[] (opcional, derivada read-only para painel operacional)

Billing Engine: inalterado (já usa cycles)
```

**Princípio:** decisões de negócio leem `subscription_cycles.status` (+ joins); timeline é **projeção** idempotente para UI, nunca input de `emitEvents`.

---

## Tabela 1 — Todos os consumidores de `detail.timeline`

| Arquivo | Função / uso | Motivo | Classificação |
|---------|--------------|--------|---------------|
| `subscriptionFinancialEventBuilder.ts` | `buildFinancialEvents` → `timelineRowForCycle` → `emitEventsForCycleRow` | Emissão de `FinancialEvent` por `operational_state`, `invoice_status`, `has_auto_retry` | **OBRIGATÓRIO** (hoje) |
| `billingStateMachine.ts` | `normalizeDetailForBillingStateMachine`, `normalizeTimelineRowForStateMachine` | Reescreve `operational_state` / `cycle_status` antes de eventos | **OBRIGATÓRIO** (hoje) |
| `subscriptionCyclesSource.ts` | `timelineRowForCycle` | Prioriza linha timeline vs `cycleToTimelineRow` | **OBRIGATÓRIO** (hoje) |
| `subscriptionFinancialExperience.ts` | `buildFinancialAlerts`, `buildFinancialInsights` (legado), helpers `isPaid`/`isOverdue` | Alertas `billing_missing`, `client_overdue`, `gateway_failed` | **OBRIGATÓRIO** (hoje) |
| `subscriptionFinancialConsistency.ts` | `enrichReceipts`, loops em `detail.timeline` | `canGenerate` legado em receipts | **LEGADO** |
| `billingSubscriptionExperience.ts` | `subscriptionHeadlineStatus`, `buildFinancialHistoryRows`, `buildBusinessTimelineEvents`, diagnósticos | Experience layer / histórico legado | **LEGADO** |
| `billingSubscriptionExperiencePolish.ts` | métricas, contagens, gráficos | Polish sobre timeline | **LEGADO** |
| `subscriptionRenewalRecovery.ts` | `buildWorkerHistoryEntries`, `findNextChargeTimelineRow` | Recovery UX | **OBRIGATÓRIO** (hoje) para recovery |
| `subscriptionFinancialEvents.ts` | `resolveNextChargePresentation` | `period_start`/`period_end` via `detail.timeline.find` | **OBRIGATÓRIO** (hoje) |
| `subscriptionNextInvoiceResolver.ts` | `getNextAwaitingGenerationCycle`, `resolveNextInvoiceCandidate` | Retorna `CrmSubscriptionTimelineRow` via `timelineRowForCycle` | **OBRIGATÓRIO** (hoje) |
| `subscriptionNextInvoice.ts` | tracking `fromTimeline` | Auditoria de fonte | **LEGADO** |
| `subscriptionFinancialOverview.ts` | KPIs failed/overdue | Busca em timeline | **OBRIGATÓRIO** (hoje) |
| `subscriptionFinancialEventStore.ts` | `financialEventStoreSignature` | Invalidação React inclui campos timeline | **OBRIGATÓRIO** (hoje) |
| `legacyCycleRecovery.ts` | `applyLegacyCycleRecovery` | Normalização timeline | **LEGADO** |
| `SubscriptionOperationalTimelinePanel.tsx` | render `detail.timeline` | Painel operacional (não referenciado em outras páginas — grep único) | **LEGADO** / órfão |
| `packages/backend/.../crmSubscriptionsService.ts` | `buildSubscriptionTimeline` → resposta API | Produção do payload | **OBRIGATÓRIO** (contrato API) |
| `packages/backend/.../crmSubscriptionsService.ts` | `buildSubscriptionAutomationSummary({ timeline })` | Resumo automação | **OBRIGATÓRIO** (backend UX) |

**Módulos que já poderiam usar apenas `subscription_cycles` (sem perder funcionalidade de cobrança):**

| Arquivo | Função | Evidência |
|---------|--------|-----------|
| `subscriptionBillingGeneration.ts` | `executeDeterministicGenerateRenewal` | Envia `cycle_id` ao backend |
| `subscriptionCyclesSource.ts` | `cycleSupportsManualGenerate`, `resolveFirstEligibleCycle`, `listCyclesFromDetail` | Lê `cycles_raw` |
| `subscriptionFinancialProjection.ts` | `occupiedDueDatesFromDetail`, `buildProjectionEvents` | `listCyclesFromDetail` + `next_billing_date` |
| `SubscriptionRenewalActionsCard.tsx` | diagnóstico | API backend `can_generate_now` |
| `recurringBillingJobService.ts` (backend) | worker / jobs | DB `subscription_cycles` |
| `billingManualRenewalService.ts` (backend) | renovação manual | Sem referência a timeline (grep) |
| `customerInvoiceService` / generate por cycle | geração | `subscription_cycle_id` |

---

## Tabela 2 — Campos exclusivos ou enriquecidos na timeline e origem real

| Campo | Presente em `cycles_raw`? | Origem real | Necessário para negócio? |
|-------|---------------------------|-------------|--------------------------|
| `operational_state` | Não | `resolveOperationalState` (cycle + invoice + job + datas + SM) | **Sim** — ramifica `emitEventsForCycleRow` |
| `merge_source` | Não | `buildTimelineRow` / `buildLifecycleTimelineRow` | **Sim** — distingue invoice_only / lifecycle |
| `invoice_status` | Não (só `invoice_id`) | Join `invRows` em `buildSubscriptionTimeline` | **Sim** — `isPaid`, `gateway_failed`, cancel |
| `gateway_status` | Não | Invoice join | **Sim** — `gateway_failed` |
| `gateway_reference_id` | Não | Invoice join | Apresentação / diagnóstico |
| `invoice_created_at` | Não | Invoice join | **Sim** — `invoice_generated`, `manual_charge` |
| `generation_note` | Não | Job / invoice context | Apresentação + notas em eventos |
| `has_auto_retry` | Não | Deriva de `recent_jobs` no build | **Sim** — eventos `charge_attempt`, `invoice_reprocessed` |
| `job_retry_at` | Não | Job join na linha | **Sim** — data de tentativa |
| `job_error_snippet` | Parcial (`error_message` no cycle) | Cycle + job enrich | **Sim** — `invoice_failed` |
| `status_pt` / `operational_state_pt` | Não | Mapeamento UX | Apresentação |
| `lifecycle_event` | Não | `subscription_change_events` | Apresentação (sem `cycle_id`) |
| `period_start` / `period_end` | **Sim** em `cycles_raw` | DB cycle | Poderia vir do cycle |
| `amount_cents` (linha) | Parcial | Cycle ou subscription default | Poderia vir do cycle |
| `cycle_skipped_reason` | **Sim** | DB cycle | Cycle |

**Faturas sem ciclo (`invoice_only`):** existem apenas como linhas timeline — **PROVEN** (`subscriptionTimelineUx.ts:547`, `merge_source: 'invoice_only'`). Não há array `invoices[]` separado no payload frontend (`CrmSubscriptionDetailPayload` em `crmSubscriptions.ts`).

---

## Tabela 3 — Dependências que impedem remover timeline da regra de negócio (hoje)

| # | Bloqueio | Evidência | Mitigação (design only) |
|---|----------|-----------|-------------------------|
| 1 | `emitEventsForCycleRow` brancha em `operational_state` | `subscriptionFinancialEventBuilder.ts:120–234` | Emitir de `resolveCyclePresentation(cycle, invoice, job)` unificado |
| 2 | `timelineRowForCycle` prefere timeline enriquecida | `subscriptionCyclesSource.ts:73–88` | Remover prioridade; usar joins explícitos |
| 3 | `normalizeDetailForBillingStateMachine` altera timeline antes de eventos | `billingStateMachine.ts:318–330` | Mover normalização para função única sobre cycle |
| 4 | `invoice_status` / gateway ausentes em `cycles_raw` | `crmSubscriptionsService.ts:390–392` | Enriquecer `cycles_raw` ou expor `invoices[]` |
| 5 | Linhas `invoice_only` sem `cycle_id` | `subscriptionTimelineUx.ts:547` | Tratar como eventos órfãos de invoice ou backfill cycles |
| 6 | Eventos lifecycle só na timeline | `buildLifecycleTimelineRow` | Campo `lifecycle_events[]` na API |
| 7 | Dual path Gerar (`cycles` vs `operational_state`) | 4.2M, 4.2L | Unificar elegibilidade em `cycle.status` + regras explícitas |
| 8 | `buildFinancialAlerts` lê timeline direto | `subscriptionFinancialExperience.ts:397–430` | Alertas a partir de `FinancialEvent[]` ou cycle+joins |
| 9 | `financialEventStoreSignature` depende de timeline | `subscriptionFinancialEventStore.ts:453–457` | Assinatura baseada em `cycles_raw` + jobs |
| 10 | Volume de assinaturas só com invoice_only | **NOT PROVEN** | Inventário de dados antes de remover |

---

## Tabela 4 — Fluxo atual vs fluxo simplificado

| Etapa | Fluxo atual | Fluxo simplificado proposto |
|-------|-------------|----------------------------|
| 1. Leitura DB | cycles + invoices + jobs + lifecycle | **Igual** |
| 2. API | `cycles_raw` + `timeline` (merge UX) | `cycles_raw` enriquecido + `invoices[]` + `lifecycle_events[]`; `timeline` opcional derivada |
| 3. Normalização frontend | `normalizeDetailForBillingStateMachine` em timeline | `normalizeCycleForBilling(cycle)` ou nada se regra no backend |
| 4. Iteração | `listCyclesFromDetail` → `timelineRowForCycle` | `listCyclesFromDetail` → join invoice/job |
| 5. Decisão evento | `row.operational_state` | `cycle.status` + regras explícitas (mesmas de `resolveOperationalState`, centralizadas) |
| 6. FinancialEvent | `emitEventsForCycleRow(..., row)` | `emitEventsForCycle(..., cycle, invoice?, job?)` |
| 7. Gerar manual | `cycleSupportsManualGenerate` (cycle) **e** eventos (timeline) | **Uma** regra: `cycle.status` ∈ generatable ∧ ¬invoice_id |
| 8. Projeção | `buildProjectionEvents` (já cycles para ocupação) | **Inalterado** |
| 9. Billing Engine | DB cycles + jobs | **Inalterado** |
| 10. Painel operacional | `detail.timeline` | Timeline = `map(cycles → presentationRow)` read-only |

---

## Tabela 5 — Componentes que permaneceriam inalterados após simplificação

| Componente / módulo | Motivo |
|---------------------|--------|
| `executeDeterministicGenerateRenewal` / botões Gerar com `cycleId` | Já usam `cycle_id` + API backend |
| `SubscriptionRenewalActionsCard` | Diagnóstico backend |
| `subscriptionFinancialProjection` / eventos `kind: 'projected'` | `cycles_raw` + `next_billing_date` |
| Backend worker / `recurringBillingJobService` | Nunca usou timeline CRM |
| Backend `generateInvoiceForCycle` / manual renew | `subscription_cycle_id` |
| `FinancialHistoryRow` + `HistoryRowChargeAction` (estrutura) | Consomem `canGenerateNow` do store (derivável de cycle) |
| `InvoiceActionsMenu`, pagamento confirmado | Invoice IDs dos eventos |
| `SubscriptionContractHistoryPanel` | Contrato, não timeline billing |
| Testes de geração determinística `subscriptionBillingGeneration.test.ts` | `cycle_id` only |

**Componentes que precisariam mudar (não permanecem inalterados):** `FinancialEventStoreProvider`, `FinancialCalendar`, `FinancialHistory`, `FinancialSummarySidebar`, `NextInvoiceCard`, `UpcomingPaymentsList`, `FinancialTechnicalAccordion`, experience layer legado.

---

## Trace 1 — Atual: `subscription_cycles` → timeline → FinancialEvent → UI

```
subscription_cycles (DB)
  │ listSubscriptionCyclesBySubscriptionId
  ▼
getCrmSubscriptionDetail (crmSubscriptionsService.ts:337–398)
  │ invRows, recent_jobs, lifecycle_events
  ▼
buildSubscriptionTimeline (subscriptionTimelineUx.ts:491)
  │ resolveOperationalState per row (L256)
  ▼
detail.timeline[] + detail.cycles_raw[]  (mesmo HTTP response)
  │
  ▼ [FRONTEND mount]
normalizeDetailForBillingStateMachine (billingStateMachine.ts:318)
  │ may rewrite operational_state (L296–315)
  ▼
buildFinancialEvents (subscriptionFinancialEventBuilder.ts:249)
  │ for each cycle in listCyclesFromDetail
  │   row = timelineRowForCycle(detail, cycle)  ← timeline WINS
  │   emitEventsForCycleRow(..., row)           ← branches on operational_state
  ▼
FinancialEvent[] (real)
  │ + buildProjectionEvents (cycles dates only)
  ▼
FinancialEventStore (subscriptionFinancialEventStore.ts)
  │ getHistoryRows, getCalendarEvents, getSidebarSummary
  ▼
UI: FinancialHistory, FinancialCalendar, NextInvoiceCard,
    UpcomingPaymentsList, FinancialInsights
  │
  ├─ canGenerateNow: cycleSupportsManualGenerate(detail, cycleId)  ← cycles_raw BYPASS
  └─ buildFinancialAlerts(detail.timeline) → FinancialSummarySidebar (parallel path)
```

---

## Trace 2 — Hipotético: `subscription_cycles` → FinancialEvent → UI

```
subscription_cycles (DB)
  ▼
getCrmSubscriptionDetail
  │ cycles_raw enriched OR cycles_raw + invoices[] + recent_jobs[]
  ▼
buildFinancialEvents (hypothetical)
  │ for each cycle in listCyclesFromDetail
  │   invoice = findInvoice(cycle.invoice_id)
  │   job = findJob(cycle.job_id | recent_jobs)
  │   emitEventsForCycle(..., cycle, invoice, job)
  │     state = deriveFromCycleStatus(cycle, invoice, job)  // single function
  ▼
FinancialEvent[]
  ▼
FinancialEventStore → UI (same components)

invoice_only rows:
  │ for each invoice without cycle_id
  │   emitEventsForOrphanInvoice(invoice)
  ▼
lifecycle:
  │ separate panel OR lifecycle_events[] (no FinancialEvent cycleId)
```

---

## Trace 3 — Comparação detalhada dos dois fluxos

| Aspecto | Atual | Hipotético |
|---------|-------|------------|
| SSOT percebido pelo frontend | Duplo: `cycles_raw` + `timeline` | Único: `cycles_raw` (+ joins) |
| Onde `operational_state` nasce | Backend `resolveOperationalState` + frontend rewrite | Uma função (preferencialmente backend) |
| Risco de divergência cycle vs UX | **Alto — PROVEN** (`legacyCancelledCycleRecovery.test.ts`) | Baixo se mesma função alimentar UI e eventos |
| Gerar no Histórico | `cycleSupportsManualGenerate` — pode mostrar Gerar sem `upcoming_cycle` no calendário | Unificado se eventos usarem mesma elegibilidade |
| Campos invoice | Embutidos na timeline | Join explícito |
| invoice_only | Na timeline | Tratamento explícito órfãos |
| Projeção futura | Independente (4.2H) | **Igual** |
| Billing Engine | Não usa timeline | **Igual** |
| Payload API | `timeline` obrigatório | `timeline` opcional / derivada client-side |
| Cache store | Assinatura inclui timeline | Assinatura em cycles + jobs |

---

## Respostas às 18 perguntas obrigatórias

### 1. Módulos que ainda dependem de `detail.timeline` para decisões de negócio

**Decisão de negócio (não só render):**

- `subscriptionFinancialEventBuilder.ts` — `emitEventsForCycleRow`
- `billingStateMachine.ts` — normalização pré-evento
- `subscriptionCyclesSource.ts` — `timelineRowForCycle` (escolha de linha)
- `subscriptionFinancialExperience.ts` — `buildFinancialAlerts`
- `subscriptionFinancialConsistency.ts` — `canGenerate` legado
- `subscriptionRenewalRecovery.ts` — próxima cobrança / worker history
- `subscriptionFinancialEvents.ts` — bounds de período
- `subscriptionNextInvoiceResolver.ts` — shape da próxima fatura
- `subscriptionFinancialOverview.ts` — KPIs
- `subscriptionFinancialEventStore.ts` — invalidação de cache

**Backend:** `buildSubscriptionAutomationSummary` usa timeline para resumo — decisão de copy/automação UX, não cobrança.

### 2. Módulos que poderiam consumir apenas `subscription_cycles`

Listados na Tabela 1 (segunda seção): geração manual, projeção, elegibilidade Gerar (History), engine backend, renewal card.

### 3. Classificação OBRIGATÓRIO vs LEGADO por uso

Ver Tabela 1. Resumo: **OBRIGATÓRIO hoje** = cadeia `FinancialEvent` + alertas + next invoice row shape. **LEGADO** = `billingSubscriptionExperience*`, `subscriptionFinancialConsistency`, `SubscriptionOperationalTimelinePanel`, `legacyCycleRecovery`.

### 4. Regras que NÃO podem ser derivadas apenas de `subscription_cycles` (campo a campo)

| Regra | Precisa além do cycle |
|-------|----------------------|
| Pago / reembolsado / cancelado invoice | `invoice.status` |
| `gateway_failed` | `gateway_status` (invoice) |
| `has_auto_retry` / tentativas | `recent_jobs` |
| `manual_invoice` | `invoice` metadata + gateway |
| Legacy false-cancel → `awaiting_generation` | Regra SM + contexto (hoje em `resolveOperationalState`) |
| Fatura sem ciclo | Invoice órfã |
| Lifecycle pause/resume/contract | `subscription_change_events` |

**Todas são deriváveis** se joins + lifecycle estiverem disponíveis fora da timeline. **Não são deriváveis** de `cycles_raw` **sozinho** — PROVEN.

### 5. Campos existentes apenas em timeline realmente necessários

Para **paridade funcional atual:** `operational_state`, `invoice_status`, `gateway_status`, `has_auto_retry`, `job_retry_at`, `invoice_created_at`, `merge_source` (para filtrar lifecycle). Para **apresentação pura:** `status_pt`, `operational_state_pt`, labels.

### 6. Esses campos poderiam ser calculados de cycles + invoices + jobs?

**Sim — PROVEN em princípio:** `buildSubscriptionTimeline` já os calcula a partir dessas fontes (`subscriptionTimelineUx.ts`). A questão é **onde** calcular (backend enrich vs frontend join), não **se** é possível.

### 7. Se timeline deixasse de existir hoje, quais telas quebrariam?

| Superfície | Quebra? | Evidência |
|------------|---------|-----------|
| Subscription Detail — Histórico financeiro | **Sim** | `FinancialEventStore` → `buildFinancialEvents` |
| Calendário financeiro | **Sim** | Eventos reais vazios/errados |
| Sidebar resumo / alertas | **Sim** | `buildFinancialAlerts(detail.timeline)` |
| Próxima cobrança (card) | **Parcial** | Seleção cycle OK; apresentação usa `timelineRowForCycle` |
| Renovação manual (Gerar) | **Parcial** | Botão History pode funcionar (`cycleSupportsManualGenerate`); calendário pode ocultar Gerar |
| Experience layer legado | **Sim** | `billingSubscriptionExperience` |
| Painel operacional timeline | **Sim** | `SubscriptionOperationalTimelinePanel` (órfão no grep de imports) |
| Billing Engine / worker | **Não** | Backend DB |
| Lista de assinaturas | **NOT PROVEN** | Não auditado neste sprint |

### 8. APIs que precisariam mudar

| API | Mudança |
|-----|---------|
| `GET .../crm-subscriptions/:id` (detail) | Enriquecer `cycles_raw` ou adicionar `invoices[]` / `lifecycle_events[]`; timeline opcional ou derivada |
| Nenhuma API de geração | `cycle_id` já é contrato (4.2D+) |

### 9. Componentes React afetados

`FinancialEventStoreProvider`, `FinancialHistory`, `FinancialCalendar`, `FinancialSummarySidebar`, `NextInvoiceCard`, `UpcomingPaymentCard`, `UpcomingPaymentsList`, `FinancialInsights`, `FinancialTechnicalAccordion`, experience components (`SubscriptionBusinessTimeline`, `SubscriptionFinancialHistory`, `SubscriptionSituationCard`, …).

### 10. Serviços backend afetados

| Serviço | Impacto |
|---------|---------|
| `crmSubscriptionsService.getCrmSubscriptionDetail` | Contrato payload |
| `subscriptionTimelineUx.buildSubscriptionTimeline` | Papel reduzido a DTO apresentação ou removido do caminho crítico |
| `buildSubscriptionAutomationSummary` | Input pode vir de cycles+jobs |
| Worker, jobs, invoice generation | **Nenhum** |

### 11. Dependência circular envolvendo timeline?

**Não há ciclo runtime infinito — PROVEN.** Há **ciclo lógico redundante:** DB → timeline (backend) → normaliza timeline (frontend) → eventos interpretam timeline em vez de reler joins. Timeline **não grava** no DB. Não é dependência circular de dados persistidos.

### 12. Timeline modifica decisões ou representa decisões já tomadas?

**Modifica decisões no frontend — PROVEN.** `operational_state` altera quais `FinancialEvent` são emitidos (`emitEventsForCycleRow`). Representa estado derivado de DB, mas a **escolha de ramo** (ex.: `failed` recoverable → `upcoming_cycle` vs `invoice_failed`) é reinterpretação que afeta UX e ações visíveis. Backend de cobrança ignora essa camada.

### 13. Informação em timeline que não existe em nenhuma outra estrutura oficial?

| Informação | Outra fonte? |
|------------|--------------|
| `operational_state` | Não persistido; só timeline (e fallback `cycleToTimelineRow` simplificado) |
| `merge_source` | Não no payload exceto timeline |
| Linhas `invoice_only` agregadas | Invoices existem no DB mas **não** no payload CRM como array |
| Lifecycle rows unificadas | Eventos existem no DB; unificação só na timeline |

### 14. Impacto de substituir `timelineRowForCycle()` por acesso direto ao cycle

- Fallback atual `cycleToTimelineRow` produz `operational_state` **mais simples** (`subscriptionCyclesSource.ts:94–140`).
- Ciclos com `status: 'cancelled'` que hoje viram `awaiting_generation` na timeline **deixariam de emitir** `upcoming_cycle` — **PROVEN** (`legacyCancelledCycleRecovery.test.ts`).
- Eventos `gateway_failed`, `has_auto_retry`, paid/refund dependeriam de joins ausentes em `cycles_raw`.
- **Gerar no History** poderia permanecer se só `cycleSupportsManualGenerate` for usado — calendário ainda divergiria até unificar emissão.

### 15. Módulos que funcionariam imediatamente se `FinancialEvent` fosse criado direto do cycle (com joins)

- `executeDeterministicGenerateRenewal`
- `cycleSupportsManualGenerate` + botões Gerar no History
- `subscriptionFinancialProjection`
- Backend billing completo
- `SubscriptionRenewalActionsCard`

**Não funcionariam sem joins:** store completo, alertas, calendário com estados gateway/retry, invoice_only.

### 16. Testes existentes que deixariam de fazer sentido

- `billingStateMachine.test.ts` — reescrita de timeline
- `legacyCycleRecovery.test.ts` — recovery via normalize timeline
- `subscriptionFinancialEventBuilder.test.ts` — casos que dependem de `operational_state` divergente da timeline vs cycle
- `packages/backend/.../legacyCancelledCycleRecovery.test.ts` — se regra unificada no cycle.status
- Testes de prioridade `timelineRowForCycle` sobre cycle
- `subscriptionFinancialConsistency*.test.ts` — camada legada

### 17. Testes novos necessários

- Paridade: `emitEventsForCycle(cycle, invoice, job)` === eventos atuais para fixtures reais
- invoice_only órfãos
- Unificação Gerar: History `canGenerateNow` ↔ calendário `supportsGenerate`
- Regressão legacy false-cancel (decisão explícita: manter ou eliminar)
- Projeção não colide com cycles (já parcialmente em 4.2H)

### 18. Risco para geração de cobranças se timeline sair da cadeia de decisão

| Área | Risco |
|------|-------|
| Worker / jobs / `generateInvoiceForCycle` | **Nenhum — PROVEN** |
| Geração manual API com `cycle_id` | **Nenhum** se backend inalterado |
| Clique Gerar no CRM | **Baixo** se `cycle_id` enviado (já é) |
| Visibilidade Gerar / cobrança “esquecida” | **Médio** — UI pode esconder ciclos elegíveis (bug atual 4.2M) |
| invoice_only sem cycle | **NOT PROVEN** em volume produção |

---

## Validação runtime (cenários funcionais)

| Cenário | Depende exclusivamente da timeline? | Resultado |
|---------|-------------------------------------|-----------|
| Algum fluxo só timeline | **Sim** — emissão `FinancialEvent` para ciclos cujo `operational_state` difere de `cycleToTimelineRow` | PROVEN |
| Botão Gerar deixa de funcionar | **Parcial** — execução usa `cycle_id`; **visibilidade** no calendário depende de eventos (timeline) | PROVEN (4.2L, 4.2M) |
| Histórico | Lista vem do store ← eventos ← timeline | **Depende** |
| Calendário | Idem + `supportsGenerate` em eventos | **Depende** |
| Próxima Cobrança | `resolveFirstEligibleCycle` (cycle) + apresentação `timelineRowForCycle` | **Parcial** |
| Renovação Manual | Backend + `cycleSupportsManualGenerate` | **Não exclusivo** |
| Billing Engine | DB cycles | **Não usa timeline** |
| Projection Layer | `cycles_raw` dates + `next_billing_date` | **Não usa timeline** para projeção |

---

## Riscos

| Risco | Severidade | Notas |
|-------|------------|-------|
| Regressão visibilidade Gerar calendário vs histórico | Alta | Já existe dual path; simplificação mal feita amplifica |
| Perda invoice_only | Média | Dados órfãos somem do financeiro |
| Legacy false-cancel recovery | Média | Comportamento intencional hoje; decisão de produto |
| Cache / re-render React | Baixa | Assinatura store |
| Billing Engine | Baixa | Fora de escopo timeline |

---

## Plano de migração (design only — sem implementação)

1. **Inventário dados:** contar assinaturas com invoices sem `subscription_cycle_id` — hoje **NOT PROVEN**.
2. **Contrato API:** adicionar joins em `cycles_raw` ou `invoices[]` + manter `timeline` como derivada read-only (fase compat).
3. **Unificar função de estado:** extrair `resolveOperationalState` para consumo único (backend preferível).
4. **Reescrever `buildFinancialEvents`:** iterar cycles + joins; deprecar `timelineRowForCycle` na emissão.
5. **Unificar elegibilidade Gerar:** uma regra para History e Calendário.
6. **Migrar `buildFinancialAlerts`** para eventos ou cycles+joins.
7. **Remover `normalizeDetailForBillingStateMachine`** quando paridade testada.
8. **Marcar timeline API deprecated;** UI operacional consome DTO derivado.
9. **Remover camada legado** `billingSubscriptionExperience` se ainda em uso — verificar rotas.

---

## Plano de rollback (design only)

1. Manter `timeline` no payload durante toda migração (feature flag no emitter: `useTimelineForEvents`).
2. Testes de paridade lado a lado (eventos timeline vs eventos cycle).
3. Rollback = reativar flag emitter sem alterar DB.
4. Nenhuma migração de schema obrigatória para fase 1.

---

## Referências de código críticas

```67:244:src/lib/subscriptionFinancialEventBuilder.ts
function emitEventsForCycleRow(
  ...
  if (row.operational_state === 'failed' && !row.invoice_id) { ... }
  if (row.operational_state === 'gateway_failed') { ... }
  ...
  if (!row.invoice_id && due && row.operational_state !== 'failed' ...) {
    if (row.operational_state === 'awaiting_generation' || ...) {
      pushEvent(..., type: 'upcoming_cycle', ...);
    }
  }
}
```

```69:90:src/lib/subscriptionCyclesSource.ts
export function timelineRowForCycle(...) {
  const byId = detail.timeline.find((r) => r.cycle_id === cycle.id);
  if (byId && byId.merge_source !== 'lifecycle') return byId;
  ...
  return cycleToTimelineRow(cycle, detail);
}
```

```356:392:packages/backend/src/services/crmSubscriptionsService.ts
  const timeline = buildSubscriptionTimeline(...);
  ...
  return {
    ...
    timeline,
    cycles_raw: cycles,
    recent_jobs,
    ...
  };
```

---

## Resposta objetiva final

| Pergunta | Resposta |
|----------|----------|
| Timeline continua parte da regra de negócio? | **Sim, no frontend CRM — PROVEN.** |
| Deve voltar a ser exclusivamente apresentação? | **Sim, como alvo arquitetural** — `subscription_cycles` (+ joins) como SSOT; timeline derivada. |
| Pode ser removida hoje sem migração? | **Não** — quebra emissão de eventos, alertas e paridade UX. |
| Billing Engine depende dela? | **Não — PROVEN.** |

**NOT PROVEN neste sprint:** frequência de `invoice_only` em produção; impacto em telas fora `SubscriptionDetail`; comportamento com payload stale parcial (timeline sem cycles atualizado).
