# Legacy UI Dependencies — Sprint 5.0-22A

Inventário completo de dependências residuais do motor legado na camada React e no store pós-cutover.

---

## Resumo

| Categoria | Count | Bloqueia remoção legado? |
|-----------|-------|--------------------------|
| Componentes montados com helper legado | **6** | Sim (parcial) |
| Store methods com fallback legado | **5** | Sim |
| Builders legados chamados só pelo store | **2** | Sim |
| Componentes desmontados com timeline direto | **4** | Não (dead code) |
| Código órfão | **1** | Não |
| Shadow/diagnóstico | **1** | Não (flag off) |

---

## Legacy Dependency Matrix

| Dependência legada | Tipo | Consumidor | Dados lidos | Substituto Aggregate | Prioridade remoção |
|-------------------|------|------------|-------------|---------------------|-------------------|
| `buildFinancialEvents` | builder | store constructor (rollback only) | detail | `aggregate.events` via adapter | P0 — rollback path |
| `buildProjectionEvents` | builder | store constructor (rollback) | detail | `aggregate.calendar` projected | P0 |
| `buildFinancialAlerts` | helper | Sidebar, SmartScroll, AlertList | **`detail.timeline`** | `aggregate.alerts` | **P1** |
| `buildFinancialHeaderData` | helper | FinancialHeader | **`detail.timeline`** | `aggregate.sidebar` + subscription | P2 |
| `buildFinancialMonthOverview` | helper | store.getMonthOverview → ForecastCard | **`detail.timeline`** | aggregate calendar/history | P3 (unmounted) |
| `buildFinancialInsights` | engine | store.getInsights | events + detail | aggregate events | P2 |
| `buildTechnicalDiagnostics` | helper | TechnicalAccordion | detail.jobs, cycles | aggregate.technical | P2 |
| `buildWorkerHistoryEntries` | helper | TechnicalAccordion | detail.recent_jobs | aggregate.technical | P2 |
| `resolveFirstEligibleCycle` | helper | store.getHistoryRows | **`detail.cycles_raw`** | `aggregate.nextInvoice` / cycles | **P1** |
| `cycleSupportsManualGenerate` | helper | store.getHistoryRows, UpcomingPaymentsList | **`detail.cycles_raw`** | `aggregate.capabilities` | **P1** |
| `resolveHistoryRowState` | state machine | store.getHistoryRows | row + today | aggregate history status | P2 |
| `financialEventToHistoryRow` | mapper | store.getHistoryRows | adapted events | `aggregate.history` | P2 |
| `resolveNextChargePresentationFromStore` | resolver | NextInvoiceCard, Sidebar | events + **`detail.timeline`** | `aggregate.nextInvoice` | **P1** |
| `resolveInvoiceCapabilities` | capabilities | InvoiceDirectActions, HistoryRow | legacy event types | `aggregate.capabilities` | **P1** |
| `invoiceAvailableActions` | actions | Invoice components | capabilities output | aggregate.capabilities | P1 |
| `subscriptionHeadlineStatus` | helper | store.getKpiCards | detail.subscription | aggregate.subscription | P2 |
| `buildFinancialHistoryRows` | builder | SubscriptionFinancialHistory | **`detail.timeline`** | aggregate.history | P3 dead |
| `collectEventsForMonth` | builder | SubscriptionFinancialCalendar | **`detail.timeline`** | aggregate.calendar | P3 dead |
| `buildBusinessTimelineEvents` | builder | SubscriptionBusinessTimeline | **`detail.timeline`** | aggregate.events | P3 dead |
| `humanizeFinancialAlerts` | formatter | Sidebar | alert + detail | aggregate.alerts | P1 |
| `executeDeterministicGenerateRenewal` | API action | SubscriptionDetail | cycleId | N/A (ação, não leitura) | Keep |
| `runBillingShadowSideEffect` | shadow | createBillingExperienceStore | both paths | N/A | Remove in 5.0-23 |

---

## Uso direto de `detail.timeline`

| Arquivo | Função | Montado? |
|---------|--------|----------|
| `subscriptionFinancialExperience.ts` | `buildFinancialAlerts`, `buildFinancialHeaderData`, month collectors | ✅ via Sidebar/Header |
| `subscriptionFinancialEvents.ts` | `resolveNextChargePresentationFromStore` competence | ✅ |
| `subscriptionFinancialConsistency.ts` | `buildFinancialMonthOverview` | 🟡 ForecastCard only |
| `subscriptionFinancialOverview.ts` | KPI click handlers | ✅ indirect |
| `subscriptionFinancialEventStore.ts` | signature only | ✅ |

**Nenhum componente React lê `detail.timeline` diretamente em JSX** — sempre via helpers legados.

---

## Uso direto de `detail.cycles_raw`

| Arquivo | Função | Montado? |
|---------|--------|----------|
| `subscriptionCyclesSource.ts` | `resolveFirstEligibleCycle`, `cycleSupportsManualGenerate` | ✅ via store |
| `FinancialTechnicalAccordion.tsx` | display raw cycles | ✅ |
| `SubscriptionRenewalActionsCard.tsx` | generate eligibility | ⚫ órfão |

---

## FinancialEventStore — paths legados com prebuilt

Quando `VITE_BILLING_USE_AGGREGATE=true`, o constructor **não** chama `buildFinancialEvents`, mas estes métodos ainda invocam helpers legados:

```
getHistoryRows()        → resolveFirstEligibleCycle(detail)
                        → cycleSupportsManualGenerate(detail)
                        → financialEventToHistoryRow()
                        → resolveHistoryRowState()

getSidebarSummary()     → getNextChargePresentation() → detail.timeline
                        → detail.subscription.amount_cents

getNextChargePresentation() → detail.timeline.find(cycle_id)

getMonthOverview()      → buildFinancialMonthOverview(detail) [timeline]

getInsights()           → buildFinancialInsights(realEvents, detail)

getKpiCards()           → subscriptionHeadlineStatus(detail)
```

---

## Feature flags e rollback

| Flag | Default | Efeito |
|------|---------|--------|
| `VITE_BILLING_USE_AGGREGATE` | `true` | Aggregate → adapter → prebuilt store |
| `VITE_BILLING_USE_AGGREGATE=false` | rollback | `FinancialEventStore` legado completo |
| `VITE_BILLING_SHADOW_MODE` | `false` | Legacy paralelo para diagnóstico |

**Rollback validado:** `tests/billing/cutover/billingCutover.test.ts`

---

## Componentes legados no repositório (não em produção)

| Componente | Path | Risco |
|------------|------|-------|
| `SubscriptionFinancialHistory` | `experience/` | Re-mount reintroduz timeline |
| `SubscriptionFinancialCalendar` | `experience/` | idem |
| `SubscriptionBusinessTimeline` | `experience/` | idem |
| `SubscriptionSituationCard` | `experience/` | idem |
| `SubscriptionRenewalActionsCard` | `subscriptions/` | Dead code com generate API |

**Recomendação 5.0-23:** remover junto com builders correspondentes.

---

## Checklist pré-remoção legado

- [ ] GAP-01: `cycle_skipped` no adapter ou history direto do aggregate
- [ ] GAP-02: Sidebar/SmartScroll → `aggregate.alerts`
- [ ] GAP-03: Generate buttons → `aggregate.capabilities`
- [ ] GAP-04: Next invoice → `aggregate.nextInvoice.metadata`
- [ ] GAP-05: Header → aggregate sidebar/subscription
- [ ] Remover `buildFinancialEvents` / `buildProjectionEvents`
- [ ] Remover cutover adapter ou invertê-lo para pass-through
- [ ] Remover feature flags cutover + shadow
- [ ] Remover experience layer legado
- [ ] Remover `SubscriptionRenewalActionsCard` órfão
- [ ] E2E billing manual + automatizado

---

## Veredicto

A UI de produção **funciona** com o cutover 5.0-22, mas **permanece acoplada** a helpers legados que leem `detail.timeline` e `detail.cycles_raw`. A remoção do legado na Sprint 5.0-23 **sem remediação prévia** resultaria em:

1. Alerts vazios ou incorretos
2. Botões de gerar com elegibilidade quebrada
3. Competência da próxima cobrança ausente
4. Ciclos ignorados invisíveis no histórico (já ocorre hoje — GAP-01)

**Recomendação formal:** executar sprint de remediação (**5.0-22B/22C**) antes de **5.0-23**.
