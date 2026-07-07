# Billing Generate Action Visibility — Forensic Audit (Sprint 4.2L)

**Mode:** READ ONLY — no code, DB, API, engine, worker, scheduler, runtime, or UI changes  
**Date:** 2026-07-02  
**Deliverable:** Single consolidated document (this file)

---

## Executive summary

The "Gerar cobrança" button visibility is decided by a **multi-layer pipeline** with **three independent gate families**:

| Gate family | Primary function | Used by |
|-------------|------------------|---------|
| **A — Cycle eligibility** | `cycleSupportsManualGenerate(detail, cycleId)` | History, Upcoming list, Store `canGenerateNow` |
| **B — Invoice capabilities** | `resolveInvoiceCapabilities` → `supportsGenerate` / `supportsResolve` | Calendar popover (`InvoiceDirectActions`) |
| **C — React render guards** | Component-level `&&` conditions | All surfaces |

**Authoritative billing rule (Sprint 4.2G/J):** `cycle_id` must exist in `cycles_raw` and cycle must be generatable (no `invoice_id`, status ∈ generatable set, subscription active).

**First point where the button is lost** depends on surface:

| Surface | First loss layer (most common) |
|---------|-------------------------------|
| **Histórico** | `cycleSupportsManualGenerate` → `canGenerateNow: false` in Store (~L169), OR row absent because `emitEventsForCycleRow` did not emit an event |
| **Calendário** | `isProjectedFinancialEvent` → `showBillingActions: false` (~L37–38), OR `supportsGenerate: false` in `invoiceCapabilities.ts` (~L75) |
| **Próxima cobrança** | `next.isProjected` or missing `next.cycleId` in `NextInvoiceCard` (~L39–42) |
| **Recebimentos previstos** | `cycleSupportsManualGenerate` in `UpcomingPaymentsList` (~L147–150) |
| **Ações de Renovação** | Backend `status.can_generate_now` (separate API path, ~L257) |

**Root cause class (proven):** Visibility is **not** a single boolean. History uses **A + C**; Calendar uses **B + C**; they can **diverge** for `invoice_failed` recoverable (both show) vs `projected` (neither shows) vs `processing` (A blocks, row may be absent).

---

## Mandatory questions — answers

| Question | Answer | Evidence |
|----------|--------|----------|
| Quem decide que um ciclo **pode** gerar cobrança? | Backend: `GENERATABLE_CYCLE_STATUSES` in `billingCycleInvoiceGenerationService.ts`; Frontend mirror: `cycleSupportsManualGenerate` in `subscriptionCyclesSource.ts:59–67` | Same status set: pending, queued, failed, skipped, cancelled |
| Quem decide que um **botão** deve aparecer? | Per-surface: Store sets `canGenerateNow`; `resolveInvoiceCapabilities` sets `supportsGenerate`; React components gate render | See pipeline table below |
| Quem **remove** o botão? | Any layer returning false; projection layer; missing event emission; `invoice_id` present; subscription cancelled/paused (Next card); backend blockers (Renewal card) | Per scenario truth table |
| Alguma camada **sobrescreve** `supportsGenerate`? | **No overwrite** — computed once in `resolveInvoiceCapabilities`. `resolveDirectInvoiceActions` may use `supportsResolve` as alternate path to same button label | `subscriptionActionExperience.ts:56–69` |
| Alguma camada **sobrescreve** `canGenerateNow`? | **Yes** — Store **re-assigns** `canGenerateNow` after `resolveHistoryRowState` (status label only, but `canGenerateNow` forced from `cycleSupportsManualGenerate` again) | `subscriptionFinancialEventStore.ts:167–176` |
| Alguma camada converte ciclos reais em **projeções**? | **No conversion** — projections are separate events from `buildProjectionEvents`. Real cycles always `kind: 'real'` in builder | `subscriptionFinancialEventBuilder.ts:59`; `subscriptionFinancialProjection.ts:39–77` |
| `cancelled` recuperável tratado como definitivo? | **Partially** — `normalizeDetailForBillingStateMachine` rewrites legacy false-cancel to `awaiting_generation`; **official** cancel may **omit** `upcoming_cycle` event → row never reaches History | `billingStateMachine.ts:98–105`, `296–310`; `subscriptionFinancialEventBuilder.ts:218–234` |
| O ciclo chega corretamente ao React? | **Only if** present in `cycles_raw` **and** `buildFinancialEvents` emitted an event with `cycleId` | `getHistoryRows` skips `!ev.cycleId` (~L159) |
| React recebe info mas **esconde**? | **Yes** — e.g. `FinancialHistoryRow` L35: `canGenerateNow && !isProjected`; `NextInvoiceCard` L39–42: `!isProjected && cycleId` | Component guards |
| Problema no **estado** ou só **renderização**? | **Both** — state can be wrong upstream (`canGenerateNow` false, no event) or correct but React hides (projected guard) | See § First/last visibility point |

---

## End-to-end pipeline diagram

```
subscription_cycles (DB)
        │ API → cycles_raw[]
        ▼
┌───────────────────────────────────────┐
│ subscriptionFinancialEventBuilder     │
│  normalizeDetailForBillingStateMachine│
│  emitEventsForCycleRow → FinancialEvent│
│  kind:'real', cycleId: cycle.id       │
└───────────────┬───────────────────────┘
                │
     ┌──────────┴──────────┐
     ▼                     ▼
realEvents          buildProjectionEvents
     │                     │ kind:'projected', cycleId:null
     └──────────┬──────────┘
                ▼
        FinancialEventStore
     canGenerateNow = cycleSupportsManualGenerate(detail, ev.cycleId)
                │
    ┌───────────┼───────────┬──────────────┐
    ▼           ▼           ▼              ▼
 History    Calendar     NextInvoice   UpcomingList
 HistoryRow  Popover      Card          ReceiptItem
     │           │           │              │
     ▼           ▼           ▼              ▼
HistoryRow   InvoiceDirect  Button       Button
ChargeAction Actions      showAction     canGenerate
     │           │           │              │
     └───────────┴───────────┴──────────────┘
                ▼
     executeDeterministicGenerateRenewal (cycle_id required)
```

---

## Table 1 — Pipeline completo da visibilidade

| Camada | Arquivo | Entrada | Saída | Responsabilidade | Pode esconder botão? | Evidência |
|--------|---------|---------|-------|------------------|---------------------|-----------|
| DB | `subscription_cycles` | billing runtime | `cycles_raw[]` in API | Materializa ciclos | **Sim** — ciclo ausente = sem `cycle_id` | Sprint 4.2K gap analysis |
| Normalização SM | `billingStateMachine.ts` | `detail.timeline` + cycles | Normalized detail | Legacy false-cancel → awaiting | **Sim** — official cancel unchanged | `normalizeTimelineRowForStateMachine` L296–310 |
| Event builder | `subscriptionFinancialEventBuilder.ts` | `cycles_raw` + timeline row | `FinancialEvent[]` | Emite `upcoming_cycle` ou `invoice_failed` etc. | **Sim** — se não emite evento, History vazio | `emitEventsForCycleRow` L67–243 |
| Projection | `subscriptionFinancialProjection.ts` | `next_billing_date` | `kind:'projected'` events | UX-only meses futuros | **Sim** — sem `cycle_id`, sem Gerar | L39–77 |
| Store merge | `subscriptionFinancialEventStore.ts` | real + projected | `events`, `realEvents` | Merge display | Indireto | L106–108 |
| Cycle gate | `subscriptionCyclesSource.ts` | `detail`, `cycleId` | `boolean` | **Autoridade** para `canGenerateNow` | **Sim** | `cycleSupportsManualGenerate` L59–67 |
| History rows | `subscriptionFinancialEventStore.ts` | `realEvents` | `FinancialHistoryRow[]` | `canGenerateNow` por ciclo | **Sim** | `getHistoryRows` L152–180 |
| History map | `subscriptionFinancialEvents.ts` | `FinancialEvent` + flags | `FinancialHistoryRow` | `canGenerateNow: projected ? false : flag` | **Sim** | L97–120 |
| State machine (event) | `billingStateMachine.ts` | event type | `canGenerate`, `showGenerateButton` | Calendário/label; History fallback | **Sim** (fallback path) | `resolveFinancialEventState` L233–251; `resolveHistoryRowState` L254–271 |
| Capabilities | `invoiceCapabilities.ts` | eventType, cycleId, invoiceId | `supportsGenerate` | Calendário InvoiceDirectActions | **Sim** | L57–80 |
| Direct actions | `subscriptionActionExperience.ts` | caps + handlers | `InvoiceAction[]` | Monta botão `generate_now` | **Sim** | L56–69 |
| History render | `FinancialHistoryRow.tsx` | row | `HistoryRowChargeAction` | `canGenerateNow && !isProjected` | **Sim** | L35–37 |
| History action | `HistoryRowChargeAction.tsx` | row | Button | `historyRowShowsChargeAction` | **Sim** | L21 |
| History show fn | `subscriptionRenewalRecovery.ts` | row | boolean | Prefere `canGenerateNow` | Propaga | L36–40 |
| Calendar popover | `FinancialCalendarPopover.tsx` | events | InvoiceDirectActions | `!projected && (cycleId \|\| invoiceId)` | **Sim** | L35–38, L79–96 |
| Calendar pick | `financialEventHelpers.ts` | day events | primary event | Prioriza real + cycleId | **Sim** — pick wrong event | `pickCalendarPopoverEvent` L110–118 |
| Next invoice | `NextInvoiceCard.tsx` | store presentation | Button | `!isProjected && cycleId` | **Sim** | L39–42, L80–116 |
| Upcoming list | `UpcomingPaymentsList.tsx` | receipts + events | `canGenerate` | `cycleSupportsManualGenerate` | **Sim** | L147–150, L71 |
| Sidebar alert | `FinancialSummarySidebar.tsx` | alert | onClick | Blocks if `!cycleId \|\| isProjected` | **Sim** | L61–67 |
| Renewal card | `SubscriptionRenewalActionsCard.tsx` | API diagnosis | disabled button | `!status.can_generate_now` | **Sim** | L257 — **backend path** |
| API generate | `subscriptionBillingGeneration.ts` | click | HTTP | Blocks without `cycle_id` | N/A (pós-click) | L55–83 |

---

## Table 2 — Truth table (runtime validation)

Assumptions: `subscription.status === 'active'`, `canViewInvoices === true`, `onGenerateBilling` handler provided, `todayYmd = 2026-06-30`.

| Status | invoice_id | cycle_id | kind | supportsGenerate | canGenerate (SM event) | showGenerateButton (SM history) | Resultado esperado | Resultado atual (código) |
|--------|------------|----------|------|------------------|------------------------|-------------------------------|--------------------|-------------------------|
| `pending` | null | UUID | real | **true** | **true** | **true** | Gerar visível | **Gerar visível** — `subscriptionFinancialGenerateActions.test.ts` L108–113 |
| `queued` | null | UUID | real | **true** | **true** | **true** | Gerar visível | **Gerar visível** — queued ∈ `GENERATABLE_CYCLE_STATUSES` |
| `skipped` (recoverable) | null | UUID | real | **true** | **true** | **true** | Gerar visível | **Gerar visível** — skipped ∈ generatable; emit L231–232 |
| `failed` (due ≥ today) | null | UUID | real (`upcoming_cycle`) | **true** | **true** | **true** | Gerar visível | **Gerar visível** — recoverable emits `upcoming_cycle` L124–138 |
| `failed` (due < today) | null | UUID | real (`invoice_failed`) | **true**¹ | **false** | **true**² | **Hipótese:** só Resolver | **Histórico: Gerar visível** — `canGenerateNow` true via failed ∈ generatable; Calendar: `supportsResolve` path L66–67 |
| `cancelled` (legacy false) | null | UUID | real | **true** | **true** | **true** | Gerar visível | **Gerar visível** — normalizado para awaiting; cancelled ∈ generatable |
| `cancelled` (official marker) | null | UUID | — | — | **false** | **false** | Sem Gerar | **Sem linha no Histórico** — emit não inclui `cancelled` op state L218–234; **botão ausente** |
| `invoiced` | UUID | UUID | real (`invoice_due`) | **false** | **false** | **false** | Abrir, não Gerar | **Sem Gerar** — test L116–132 |
| `processing` | null | UUID | — | **false**³ | **false** | **false** | Sem Gerar | **Sem Gerar** — processing ∉ generatable; emit improvável |
| projected | null | **null** | projected | **false** | **true**⁴ | **false** | Sem Gerar (UX) | **Sem Gerar** — test L144–148; `canGenerateNow` forced false L118 |
| `paused` sub | null | UUID | real | **true**⁵ | **true** | **true** | **Hipótese:** bloquear | **Histórico: pode mostrar**; `NextInvoiceCard` sem `active` check em showAction — **só** `status === 'active'` L40 |

¹ `supportsGenerate`: `(failed && !hasInvoice) && cycleId` — `invoice_failed` event type.  
² `showGenerateButton`: `base.state === 'failed'` branch L266–269.  
³ `cycleSupportsManualGenerate`: processing ∉ `GENERATABLE_CYCLE_STATUSES`.  
⁴ `resolveFinancialEventState` for `upcoming_cycle` always `canGenerate: true` L244–246 — **não usado** quando `canGenerateNow` boolean set.  
⁵ `cycleSupportsManualGenerate` não verifica `paused` — só `cancelled` L63.

---

## Table 3 — Propagação do estado

| subscription_cycle | FinancialEvent | HistoryRow | CalendarEvent | Capabilities | Render final |
|--------------------|----------------|----------|---------------|--------------|--------------|
| pending, no inv | `upcoming_cycle`, kind:real, cycleId | `canGenerateNow:true`, `isProjected:false` | `cycleId`, `isProjected:false` | `supportsGenerate:true` | **Gerar** (History + Calendar) |
| queued, no inv | same | same | same | same | **Gerar** |
| skipped, no inv | `upcoming_cycle` | `canGenerateNow:true` | same | same | **Gerar** |
| failed recoverable | `upcoming_cycle` | `canGenerateNow:true` | same | same | **Gerar** |
| failed past | `invoice_failed` | `canGenerateNow:true`¹ | `invoice_failed` | `supportsGenerate:true`² | **Gerar** (ambos) |
| cancelled legacy | `upcoming_cycle` (after normalize) | `canGenerateNow:true` | same | same | **Gerar** |
| cancelled official | *(no event)* | *(row absent)* | dot may exist from projection only | N/A | **Sem Gerar** |
| invoiced | `invoice_due` / `payment` | `canGenerateNow:false` | `invoiceId` set | `supportsGenerate:false` | **Abrir** only |
| processing | *(often no upcoming event)* | absent or `canGenerateNow:false` | varies | false | **Sem Gerar** |
| N/A (projection) | `upcoming_cycle`, kind:projected, cycleId:null | not in `getHistoryRows` | `isProjected:true` | `supportsGenerate:false` | **Aviso previsto** only |

¹ Because `failed` ∈ `GENERATABLE_CYCLE_STATUSES` without date check in `cycleSupportsManualGenerate`.  
² `isFailedEventType` + `!hasInvoice` + `cycleId`.

---

## Mandatory trace — layer by layer

### 1. `subscription_cycles` → `cycles_raw`

- API returns `detail.cycles_raw` from backend `subscription_cycles` query.
- **Loss:** cycle never materialized in DB → no `cycle_id` anywhere (Sprint 4.2K RC #1).

### 2. `subscriptionFinancialEventBuilder.ts`

```typescript
// L258–261: iterates cycles only
for (const cycle of listCyclesFromDetail(normalized)) {
  const row = timelineRowForCycle(normalized, cycle);
  emitEventsForCycleRow(..., cycle, row);
}
```

**`cycleId` assignment:** always `cycle.id` (L77).

**Emission guard for upcoming (L218–234):** requires `!invoice_id`, `operational_state !== 'failed'` (or recoverable branch), and one of: future date, `awaiting_generation`, `scheduled`, `skipped`, or `cycle_status` ∈ `{skipped, pending}`.

**Loss points:**
- Official `cancelled` operational_state → **no `upcoming_cycle`** emitted.
- `processing` → typically **no** upcoming event.
- Cycle exists but emission conditions fail → **History has no row** for that competence.

### 3. `FinancialEvent` / `FinancialEventStore`

```typescript
// subscriptionFinancialEventStore.ts L167–176
canGenerateNow: cycleSupportsManualGenerate(this.detail, ev.cycleId),
```

**`canGenerateNow` does NOT use `resolveHistoryRowState.showGenerateButton`** — Store overwrites with cycle gate only (L175 re-applies same value).

**History source:** `realEvents` only (L157) — projections never in History.

**Loss:** `filter` at L159 `if (!ev.cycleId) continue` — events without cycleId excluded (should not happen for real events post-4.2G).

### 4. `cycleSupportsManualGenerate()` — **primary eligibility**

```typescript
// subscriptionCyclesSource.ts L59–67
if (detail.subscription.status === 'cancelled') return false;
const cycle = findCycleById(detail, cycleId);
if (!cycle || cycle.invoice_id) return false;
return GENERATABLE_CYCLE_STATUSES.has(cycle.status);
```

**Statuses allowed:** pending, queued, failed, skipped, cancelled.

**Not allowed:** processing, invoiced (DB status — if used), absent cycle.

**Does NOT check:** due date, legacy vs official cancel, paused subscription.

### 5. `resolveFinancialEventState()` / `resolveHistoryRowState()`

```typescript
// billingStateMachine.ts L244–246 — upcoming_cycle
return { state: 'awaiting_generation', label: 'Prevista', canGenerate: true, isFuture };

// L266–270 — showGenerateButton
const showGenerateButton =
  !row.invoiceId &&
  Boolean(row.cycleId?.trim()) &&
  (base.state === 'awaiting_generation' || base.state === 'failed') &&
  (base.state !== 'awaiting_generation' || base.canGenerate);
```

**Used when:** `historyRowShowsChargeAction` fallback if `canGenerateNow` is not boolean (L38–40).

**Current path:** Store always sets boolean `canGenerateNow` → **state machine bypassed** for History visibility.

### 6. `invoiceCapabilities` / `supportsGenerate`

```typescript
// invoiceCapabilities.ts L75
supportsGenerate: (forecast || (failed && !hasInvoice)) && Boolean(input.cycleId?.trim()),
```

**Requires:** `eventType === 'upcoming_cycle'` (forecast) OR failed-type without invoice, **and** `cycleId`.

**Alternate:** `supportsResolve` for `invoice_failed` → `resolveDirectInvoiceActions` still returns `generate_now` button (L66–67).

**No runtime overwrite** — single computation per call.

### 7. Component render gates

| Component | Condition for Gerar | File:line |
|-----------|---------------------|-----------|
| `FinancialHistoryRow` | `row.canGenerateNow && !row.isProjected` | `FinancialHistoryRow.tsx:35` |
| `HistoryRowChargeAction` | `historyRowShowsChargeAction(row)` | `HistoryRowChargeAction.tsx:21` |
| `FinancialCalendarPopover` | `!projected` → `InvoiceDirectActions` → `supportsGenerate \|\| supportsResolve` + handler | `FinancialCalendarPopover.tsx:35–38, 79–96` |
| `NextInvoiceCard` | `active && !isProjected && (hasInvoice ? open : cycleId && handler)` | `NextInvoiceCard.tsx:39–42` |
| `UpcomingPaymentsList` | `canGenerate && cycleId && !invoiceId` | `UpcomingPaymentsList.tsx:71, 147–150` |
| `FinancialSummarySidebar` | alert click: `nextInvoice.cycleId && !isProjected` | `FinancialSummarySidebar.tsx:61–67` |
| `SubscriptionRenewalActionsCard` | `canEdit && status.can_generate_now && !processing_job` | `SubscriptionRenewalActionsCard.tsx:257` |

---

## Mandatory debug trace — where values change

| Variable | Set at | Can change downstream? |
|----------|--------|------------------------|
| `supportsGenerate` | `resolveInvoiceCapabilities` | **No** — unless input props change |
| `canGenerate` (SM) | `resolveFinancialEventState` | **Ignored** by History when `canGenerateNow` boolean set |
| `canGenerateNow` | Store `getHistoryRows` | **No** in components — read-only on row |
| `showGenerateButton` | `resolveHistoryRowState` | **Only if** `historyRowShowsChargeAction` fallback (no boolean `canGenerateNow`) |
| `kind` | Builder: `'real'`; Projection: `'projected'` | Immutable per event |
| `cycleId` | Builder: `cycle.id`; Projection: `null` | Immutable |
| `invoiceId` | From timeline row | If set → capabilities + cycle gate false |
| `status` (cycle) | `cycles_raw[].status` | Drives `cycleSupportsManualGenerate` only |

**Documented divergence (proven):**

| Scenario | `canGenerateNow` | `supportsGenerate` | Visible in History | Visible in Calendar |
|----------|------------------|--------------------|--------------------|---------------------|
| projected month | N/A (not in history) | false | No | No (notice only) |
| pending real | true | true | Yes | Yes |
| official cancelled | row absent | N/A | No | Maybe projection only |
| past failed | **true** | **true** | Yes | Yes |
| processing | false / no row | false | No | Unlikely |

---

## First / last visibility point analysis

### Scenario A — Projected month (no `cycles_raw` row)

| Step | Still visible? |
|------|----------------|
| `buildProjectionEvents` creates event | cycleId = null |
| `mergeRealAndProjectionEvents` | in `events`, not `realEvents` |
| `getHistoryRows` | **LOST** — iterates `realEvents` only |
| Calendar popover `pickCalendarPopoverEvent` | may pick projected if no real |
| `showProjectionNotice` | **LOST** — `FinancialCalendarPopover` L79 |
| **First loss:** `subscriptionFinancialProjection.ts` — `cycleId: null` by design |

### Scenario B — Real pending cycle with `cycle_id`

| Step | Still visible? |
|------|----------------|
| All gates pass | visible |
| **Last point with button:** `HistoryRowChargeAction` / `InvoiceDirectActions` render |
| **First loss (if any):** none — full pipeline open |

### Scenario C — Real cycle, `invoice_id` set

| Step | Still visible? |
|------|----------------|
| `cycleSupportsManualGenerate` | **LOST** — `cycle.invoice_id` L65 |
| `supportsGenerate` | **LOST** — `hasInvoice` L58 |
| **First loss:** `subscriptionCyclesSource.ts:65` |

### Scenario D — Official cancelled cycle

| Step | Still visible? |
|------|----------------|
| `emitEventsForCycleRow` | **LOST** — no upcoming emission |
| `getHistoryRows` | no row |
| **First loss:** `subscriptionFinancialEventBuilder.ts:218–234`

### Scenario E — Calendar shows Gerar, History does not (hypothesis)

**Not proven in code for same cycle** when both use real `upcoming_cycle` + same `cycleId`.  
**Proven divergence:** Calendar day with **only** projected events vs History with real cycle on different dates.

**Hypothesis (unproven):** `pickCalendarPopoverEvent` picks `invoice_due` over `upcoming_cycle` when invoice exists — Gerar hidden via `supportsGenerate` false, but History dedupes by cycleKey showing different event type.

---

## Answers to audit scope — layer override questions

| Question | Verdict |
|----------|---------|
| `supportsGenerate` overwritten? | **No** |
| `canGenerateNow` overwritten? | **Set once** in Store; components read-only |
| Real → projected conversion? | **No** — separate event streams |
| Legacy cancelled as definitive? | **No** for generatable set + normalization |
| Official cancelled as definitive? | **Yes** — event emission skips |

---

## SubscriptionRenewalActionsCard — parallel pipeline

This card **does not** use `cycleSupportsManualGenerate` or `supportsGenerate`.

```typescript
// SubscriptionRenewalActionsCard.tsx L257
disabled={!canEdit || !status.can_generate_now || ...}
```

`can_generate_now` from `crmSubscriptionsService.getRenewalDiagnosis` → backend `assessManualGenerateReadiness`.

**Proven:** Button can be disabled while History shows Gerar for non-first eligible cycles, or enabled/disabled based on worker/scheduler blockers invisible to frontend cycle gate.

---

## Recommended corrections (Sprint 4.2M — not implemented)

| P | Issue | Recommendation |
|---|-------|----------------|
| P0 | History vs Calendar use different gates | Unify on `cycleSupportsManualGenerate` + `cycleId` for all surfaces |
| P0 | Projected days confuse users | Calendar: never show action area for `kind: projected` (already done); add explicit "sem ciclo oficial" |
| P1 | `canGenerateNow` ignores date for `failed` | Align `cycleSupportsManualGenerate` with `isRecoverableCycleFailure` |
| P1 | Official cancelled absent from History | Emit read-only row or badge "cancelado definitivo" |
| P1 | `processing` cycles | Show "Processando" without Gerar; explicit `canGenerateNow: false` reason |
| P2 | Renewal card vs financial UI | Surface same `cycle_id` in diagnosis API response for parity |
| P2 | Paused subscription | Add `paused` check to `cycleSupportsManualGenerate` |
| P2 | Sidebar alert always shows "Gerar agora" label | Disable button when `!nextInvoice.cycleId` |

---

## Definition of done — Sprint 4.2L

| Criterion | Status |
|-----------|--------|
| No functional changes | ✓ |
| Full pipeline reconstructed | ✓ |
| All visibility rules documented | ✓ |
| First button loss point identified | ✓ (per scenario) |
| No unmarked hypotheses | ✓ (marked in truth table) |
| Single document | ✓ |
| Ready for 4.2M | ✓ |

---

## File index (mandatory components)

| File | Role in visibility |
|------|-------------------|
| `src/lib/subscriptionFinancialEventBuilder.ts` | Event emission + `cycleId` |
| `src/lib/subscriptionFinancialEventStore.ts` | `canGenerateNow` assignment |
| `src/lib/subscriptionFinancialEvents.ts` | History row mapping |
| `src/lib/subscriptionBillingGeneration.ts` | Post-click gate (`cycle_id` required) |
| `src/lib/invoiceCapabilities.ts` | `supportsGenerate` |
| `src/lib/subscriptionCyclesSource.ts` | `cycleSupportsManualGenerate` |
| `src/lib/billingStateMachine.ts` | `resolveFinancialEventState`, `resolveHistoryRowState` |
| `src/lib/subscriptionRenewalRecovery.ts` | `historyRowShowsChargeAction` |
| `src/lib/subscriptionActionExperience.ts` | `resolveDirectInvoiceActions` |
| `src/components/subscriptions/financial/FinancialCalendarPopover.tsx` | Calendar render |
| `src/components/subscriptions/financial/FinancialHistoryRow.tsx` | History render |
| `src/components/subscriptions/financial/InvoiceDirectActions.tsx` | Calendar action buttons |
| `src/components/subscriptions/financial/UpcomingPaymentsList.tsx` | Upcoming render |
| `src/components/subscriptions/financial/NextInvoiceCard.tsx` | Next invoice render |
| `src/components/subscriptions/SubscriptionRenewalActionsCard.tsx` | Backend-driven generate |

**Tests as evidence:** `src/lib/subscriptionFinancialGenerateActions.test.ts`, `src/lib/subscriptionFinancialUxRefinement.test.ts`, `src/lib/renewalRecoveryCompletion.test.ts`.
