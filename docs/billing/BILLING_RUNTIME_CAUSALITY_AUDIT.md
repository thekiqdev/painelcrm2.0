# Billing Runtime Causality Audit — Sprint 4.2M

**Mode:** READ ONLY — no code changes, no commits, no fixes  
**Date:** 2026-07-02  
**Goal:** Prove whether "Gerar" disappearance is caused by FinancialEvent generation or only by React rendering.

---

## Final verdict (single primary root cause)

**Primary root cause:** The button disappears because **`subscription_cycle` rows in `cycles_raw` are not faithfully represented as billable `FinancialEvent`s** — not because React alone hides a correct event.

The **first point of fidelity loss** is `emitEventsForCycleRow` in `subscriptionFinancialEventBuilder.ts` (L67–243): emission is **conditional** on `CrmSubscriptionTimelineRow` fields (`operational_state`, `invoice_id`, `cycle_status`, dates). A cycle can exist in `cycles_raw` and produce **zero** `FinancialEvent`s. History (`getHistoryRows`) iterates **only emitted** `realEvents` (L157), so **no row → no Gerar in Histórico**.

Rendering adds a **second** loss layer (`canGenerateNow`, `isProjected`, `supportsGenerate`) but **cannot show Gerar for a cycle that never became an event** in History.

**Is the problem only rendering?** **NO — PROVEN.** Causality: `cycles_raw` → `emitEventsForCycleRow` (may emit 0) → `realEvents` → `getHistoryRows` (skip if no event) → React.

**Single Source of Truth (4.2G) respected?** **Partially.** Real billing events are built only from `cycles_raw` via one builder (`buildFinancialEvents`). **However**, a **parallel pipeline** still exists: `buildProjectionEvents` (4.2H) creates `kind:'projected'` events without `cycle_id`, and `detail.timeline` still influences event **type** via `timelineRowForCycle` — so SSOT is **not** a direct 1:1 `subscription_cycle` → UI row mapping.

---

## Secondary causes (separate)

| # | Cause | Layer | Evidence |
|---|-------|-------|----------|
| S1 | React hides Gerar when `canGenerateNow === false` even if event exists | Render | `FinancialHistoryRow.tsx:35` |
| S2 | Projected events (`cycleId: null`) never get Gerar by design | Parallel pipeline 4.2H | `subscriptionFinancialProjection.ts:66` |
| S3 | History collapses multiple events per cycle to **one** via `eventTypePriority` | Store post-process | `subscriptionFinancialEventStore.ts:156–163` |
| S4 | Calendar uses `supportsGenerate` (capabilities), not `canGenerateNow` | Render / capabilities | `invoiceCapabilities.ts:75` |
| S5 | `SubscriptionRenewalActionsCard` uses backend `can_generate_now`, not frontend cycle gate | Parallel API path | `SubscriptionRenewalActionsCard.tsx:257` |
| S6 | DB cycle absent from `cycles_raw` (lazy materialization) | Backend / API | Sprint 4.2K — **NOT PROVEN** in this frontend-only trace |

---

## Mandatory questions — answers

| # | Question | Answer | Evidence |
|---|----------|--------|----------|
| 1 | Para CADA `subscription_cycle`, qual `FinancialEvent` é criado? | **0 a N eventos** — ver tabela Cycle ↔ Event abaixo | `emitEventsForCycleRow` L67–243 |
| 2 | Existe exatamente um caminho `subscription_cycle` → `FinancialEvent`? | **NO** — um ciclo pode gerar vários tipos; projeção é caminho separado | Builder + `buildProjectionEvents` |
| 3 | Algum `subscription_cycle` não gera nenhum `FinancialEvent`? | **YES** | Guards L218–234, L120–121, subscription `cancelled` L421 test |
| 4 | Algum `FinancialEvent` nasce sem `subscription_cycle`? | **YES** — projeções `cycleId: null` | `subscriptionFinancialProjection.ts:57–75` |
| 5 | Projeção após 4.2G? | **YES** — intentional 4.2H | `FinancialEventStore` constructor L107–108 |
| 6 | Duplicação por `cycle_id`? | **YES** — múltiplos eventos mesmo `cycleId`, ids únicos | `subscriptionFinancialEventBuilder.test.ts` L367–369, L425–429 |
| 7 | Mais de um builder? | **YES** — dois: `buildFinancialEvents` + `buildProjectionEvents` | `subscriptionFinancialEventStore.ts:106–108` |
| 8 | Merge recria projeções? | **NO** — merge **adiciona** projeções filtradas, não recria reais | `mergeRealAndProjectionEvents` L81–94 |
| 9 | Eventos descartados após criados? | **YES** — History dedupe por `cycleKey`; projeções filtradas se data ocupada por real | Store L156–163; merge L88–91 |
| 10 | Quem decide `upcoming_cycle`? | `emitEventsForCycleRow` L124–138 (failed recoverable) ou L235–241 | |
| 11 | Quem decide `invoice_due`? | `emitEventsForCycleRow` L209–215 | |
| 12 | Quem decide `invoice_generated`? | `emitEventsForCycleRow` L197–206 | |
| 13 | Quem decide `payment`? | `emitEventsForCycleRow` L90–96 (`isPaid`) | |
| 14 | Quem decide `invoice_cancelled`? | `emitEventsForCycleRow` L108–117 | |
| 15 | Switch que transforma tipo? | **YES** — `failed` recoverable → `upcoming_cycle` | L124–138 |
| 16 | Quem define `canGenerateNow`? | `cycleSupportsManualGenerate` in Store `getHistoryRows` | `subscriptionFinancialEventStore.ts:169,175` |
| 17 | Quem altera `canGenerateNow` depois? | **NO** — set once on HistoryRow; `financialEventToHistoryRow` forces false if projected | `subscriptionFinancialEvents.ts:118` |
| 18 | Quem altera `supportsGenerate` depois? | **NO** — computed per call in `resolveInvoiceCapabilities` | `invoiceCapabilities.ts:57–80` |
| 19 | Quem altera `showGenerateButton` depois? | **NO** — only in `resolveHistoryRowState`; bypassed when `canGenerateNow` boolean set | `subscriptionRenewalRecovery.ts:36–40` |
| 20 | React sobrescreve flags? | **NO mutation** — read-only guards (`&& !isProjected`, etc.) | `FinancialHistoryRow.tsx:35` |

---

## Forward trace

```
subscription_cycles (DB)
    │ API payload: detail.cycles_raw[]
    ▼
listCyclesFromDetail()                    subscriptionCyclesSource.ts:22–26
    ▼
normalizeDetailForBillingStateMachine()   billingStateMachine.ts:318–330
    │ rewrites timeline rows (legacy false-cancel → awaiting_generation)
    ▼
timelineRowForCycle(detail, cycle)        subscriptionCyclesSource.ts:69–91
    │ prefers detail.timeline match; else cycleToTimelineRow(cycle)
    ▼
emitEventsForCycleRow(cycle, row)         subscriptionFinancialEventBuilder.ts:67–243
    │ 0..N FinancialEvent, kind:'real', cycleId: cycle.id
    ▼
buildFinancialEvents() → realEvents[]     subscriptionFinancialEventBuilder.ts:249–264
    │
    ├─ buildProjectionEvents() → kind:'projected', cycleId:null
    │       subscriptionFinancialProjection.ts:39–77
    ▼
mergeRealAndProjectionEvents() → events[] subscriptionFinancialProjection.ts:81–94
    ▼
FinancialEventStore constructor             subscriptionFinancialEventStore.ts:99–108
    ▼
getHistoryRows()                          subscriptionFinancialEventStore.ts:152–180
    │ filter realEvents; dedupe by cycleKey; canGenerateNow = cycleSupportsManualGenerate
    ▼
FinancialHistoryRow                       FinancialHistoryRow.tsx:35–37
    │ chargeAction if canGenerateNow && !isProjected
    ▼
HistoryRowChargeAction                    HistoryRowChargeAction.tsx:21
    ▼
executeDeterministicGenerateRenewal       subscriptionBillingGeneration.ts:48–99

Calendar branch (parallel):
events[] → pickCalendarPopoverEvent → FinancialCalendarPopover
    → resolveInvoiceCapabilities → supportsGenerate → InvoiceDirectActions
```

---

## Reverse trace

| FinancialEvent origin | Builder | cycle_id | projected? |
|----------------------|---------|----------|------------|
| `payment`, `invoice_*`, `upcoming_cycle`, etc. | `buildFinancialEvents` → `emitEventsForCycleRow` | Always `cycle.id` | `kind:'real'` |
| `upcoming_cycle` projected | `buildProjectionEvents` | **null** | `kind:'projected'` |
| History row | Derived from **one** real event per `cycleKey` | From event | `isProjected: false` always |

**Reverse rule:** `FinancialEvent.cycleId` → `findCycleById(detail, cycleId)` → `cycles_raw[]`. Projected events: **no reverse link** — NOT PROVEN mapping to any cycle.

---

## Table 1 — Cycle ↔ Event mapping

Derived from **execution order** in `emitEventsForCycleRow` (independent `if` blocks — multiple can fire).

| cycle_status | invoice_id | Timeline / op state (typical) | FinancialEvent(s) criado(s) | event_type(s) | kind | canGenerateNow¹ | supportsGenerate² | showGenerateButton³ |
|--------------|------------|-------------------------------|----------------------------|---------------|------|-----------------|-------------------|---------------------|
| `pending` | null | `awaiting_generation` | `sched-{id}-{due}` | `upcoming_cycle` | real | **true** | **true** | **true** |
| `queued` | null | `awaiting_generation`⁴ | `sched-…` | `upcoming_cycle` | real | **true** | **true** | **true** |
| `skipped` | null | `skipped` | `sched-…` | `upcoming_cycle` | real | **true** | **true** | **true** |
| `failed` | null | `failed`, due ≥ today | `sched-…` | `upcoming_cycle`⁵ | real | **true** | **true** | **true** |
| `failed` | null | `failed`, due < today | `fail-…` | `invoice_failed` | real | **true**⁶ | **true**⁷ | **true**⁷ |
| `cancelled` (legacy false) | null | normalized → `awaiting_generation` | `sched-…` | `upcoming_cycle` | real | **true** | **true** | **true** |
| `cancelled` (official, past due) | null | `cancelled` | **NONE** | — | — | N/A (no History row) | N/A | **false** |
| `cancelled` (official, future due) | null | `cancelled` | `sched-…` **only if** `isFuture` | `upcoming_cycle` | real | **true** | **true** | **true** |
| `processing` | null | `awaiting_generation`⁴ | `sched-…` | `upcoming_cycle` | real | **false**⁸ | **true** | **false**⁸ |
| `invoiced` / has invoice | UUID | `generated` | `due-…` + maybe `gen-…`, `payment` if paid | `invoice_due`, etc. | real | **false** | **false** | **false** |
| paid invoice | UUID | paid | `payment-…` + `invoice_due` if not paid branch skipped | `payment` | real | **false** | **false** | **false** |
| *(no cycle in cycles_raw)* | — | — | `projected-{due}` | `upcoming_cycle` | **projected** | **false**⁹ | **false** | **false** |
| subscription `cancelled` | any | any | **NONE** for upcoming paths | — | — | **false** | — | **false** |

¹ `canGenerateNow` = `cycleSupportsManualGenerate(detail, cycleId)` — `subscriptionCyclesSource.ts:59–67`  
² `supportsGenerate` for `upcoming_cycle` + `cycleId` — `invoiceCapabilities.ts:75`  
³ `showGenerateButton` bypassed when `canGenerateNow` boolean on row — `subscriptionRenewalRecovery.ts:38`  
⁴ `cycleToTimelineRow` does not map `queued`/`processing` to distinct op states — defaults `awaiting_generation` (`subscriptionCyclesSource.ts:104–105`)  
⁵ **Type transform:** `failed` recoverable → `upcoming_cycle` (`subscriptionFinancialEventBuilder.ts:124–138`)  
⁶ `failed` ∈ `GENERATABLE_CYCLE_STATUSES` — no date check in `cycleSupportsManualGenerate`  
⁷ `invoice_failed` + `cycleId` → `supportsGenerate` true (`invoiceCapabilities.ts:64–75`)  
⁸ `processing` ∉ `GENERATABLE_CYCLE_STATUSES` — event may exist but `canGenerateNow` false  
⁹ Projected events excluded from `getHistoryRows` (uses `realEvents` only)

---

## Table 2 — FinancialEvent origin

| FinancialEvent | Builder | Arquivo | Função | cycle_id | projected | duplicated |
|----------------|---------|---------|--------|----------|-----------|------------|
| All `kind:'real'` | Real builder | `subscriptionFinancialEventBuilder.ts` | `pushEvent` / `emitEventsForCycleRow` | `cycle.id` | false | Per-event id dedupe `seen` L54–55 |
| `upcoming_cycle` (recoverable failed) | Real builder | same | `emitEventsForCycleRow` L124–138 | yes | false | Same cycle may also have other types |
| `projected-*` | Projection | `subscriptionFinancialProjection.ts` | `buildProjectionEvents` | **null** | true | `seen` by due date L48–54 |
| History display row | Store (derived) | `subscriptionFinancialEventStore.ts` | `getHistoryRows` | from event | false | **One per cycleKey** L156–163 |
| Calendar popover view | Component | `financialEventHelpers.ts` | `pickCalendarPopoverEvent` | from picked event | either | N/A |

**Orphan projected events:** `cycleId: null` — **PROVEN** (`subscriptionFinancialProjection.ts:66`).

**Orphan real events:** **NOT PROVEN** — `pushEvent` requires `cycleId: string` (L47).

**Cycles without events:** **PROVEN** — e.g. `buildFinancialEvents` returns `[]` when subscription cancelled (`subscriptionFinancialEventBuilder.test.ts` L421).

---

## Table 3 — Generate visibility pipeline

| Etapa | Entrada | Saída | Motivo da alteração |
|-------|---------|-------|---------------------|
| 1. `cycles_raw` | DB rows | API array | Backend query — outside this audit |
| 2. `normalizeDetailForBillingStateMachine` | `detail.timeline` | timeline rewritten | Legacy false-cancel → awaiting (`billingStateMachine.ts:303–310`) |
| 3. `timelineRowForCycle` | cycle + timeline | `CrmSubscriptionTimelineRow` | May use API timeline vs `cycleToTimelineRow` (`subscriptionCyclesSource.ts:69–91`) |
| 4. `emitEventsForCycleRow` | cycle + row | 0..N `FinancialEvent` | Conditional guards L90–243 — **first fidelity break** |
| 5. `buildProjectionEvents` | `next_billing_date` | projected events | Parallel SSOT break (UX 4.2H) |
| 6. `mergeRealAndProjectionEvents` | real + projected | `events[]` | Drops projected dates occupied by real (`L88–91`) |
| 7. `getHistoryRows` | `realEvents` | `FinancialHistoryRow[]` | Skips `!cycleId`; dedupes by `cycleKey` (`L157–163`) |
| 8. `cycleSupportsManualGenerate` | detail + cycleId | boolean → `canGenerateNow` | Status/invoice/subscription gates (`subscriptionCyclesSource.ts:59–67`) |
| 9. `financialEventToHistoryRow` | event + flags | row | `projected ? false : canGenerateNow` (`subscriptionFinancialEvents.ts:118`) |
| 10. `resolveHistoryRowState` | row | `statusPt` only | `canGenerateNow` **re-applied** after, not from `showGenerateButton` (Store L175) |
| 11. `FinancialHistoryRow` | row | `HistoryRowChargeAction` | `canGenerateNow && !isProjected` (`FinancialHistoryRow.tsx:35`) |
| 12. `resolveInvoiceCapabilities` | eventType, cycleId | `supportsGenerate` | Calendar path (`invoiceCapabilities.ts:75`) |
| 13. `FinancialCalendarPopover` | event | actions block | `!projected && (cycleId \|\| invoiceId)` (`L35–38`) |
| 14. `NextInvoiceCard` | presentation | button | `!isProjected && cycleId` (`NextInvoiceCard.tsx:39–42`) |

---

## Runtime checks (static + test execution)

Executed: `npx vitest run subscriptionFinancialGenerateActions.test.ts subscriptionFinancialEventBuilder.test.ts` — **69 tests passed** (2026-07-02).

| Check | Result | Evidence |
|-------|--------|----------|
| Count `subscription_cycles` | `cycles_raw.length` per payload | `listCyclesFromDetail` |
| Count `FinancialEvent` (real) | `buildFinancialEvents(detail).length` | Store L106; test L474 equality |
| Events per `cycle_id` | **0, 1, or many** | Multiple `if` in `emitEventsForCycleRow`; test L367 "multiple events same day" |
| Orphan `FinancialEvent` (real) | **NOT PROVEN** | All real events carry `cycleId` in `pushEvent` |
| Orphan projected events | **PROVEN** | `cycleId: null` |
| Cycles without events | **PROVEN** | Official cancelled + past; sub cancelled → `[]` |
| Duplicate event `id` | **Prevented** | `seen.has(payload.id)` L54 |
| Duplicate `cycle_id` types | **PROVEN** | payment + invoice_due same cycle |
| Projected mixed with real | **PROVEN** in `events[]`; History uses `realEvents` only | Store L106–108, L157 |
| Parallel builders | **PROVEN** | `buildFinancialEvents` + `buildProjectionEvents` |
| Post-merge discard | **PROVEN** | Projection filter; History dedupe |

**`filterHistoryToSingleFutureCharge`:** Defined in `subscriptionFinancialEvents.ts:264` but **NOT called** by `getHistoryRows` (grep: only definition). **NOT PROVEN** active in current History path — dead code for visibility.

---

## Event type decision tree (proven execution)

```
emitEventsForCycleRow(cycle, row):
  if isPaid(row)                    → payment          (L90–96)
  if isRefunded(row)                → invoice_refunded (L99–106)
  if invCancelled && invoice_id     → invoice_cancelled (L108–117)
  if op_state === 'failed' && !inv:
    if sub cancelled               → return (no event) (L121)
    if isRecoverableCycleFailure    → upcoming_cycle   (L124–138)  ← TYPE TRANSFORM
    else                           → invoice_failed    (L140–153)
  if op_state === 'gateway_failed' → invoice_failed   (L157–164)
  if has_auto_retry && due          → invoice_reprocessed (L167–173)
  if has_auto_retry && job_id       → charge_attempt   (L176–184)
  if manual_invoice && invoice      → manual_charge    (L187–194)
  if invoice && created_at != due   → invoice_generated (L197–206)
  if invoice && due && !paid        → invoice_due      (L209–215)
  if !invoice && due && guards...   → upcoming_cycle   (L218–242)
```

**`invoice_cancelled` event type ≠ cycle `status: cancelled`** — former requires `invoice_id` + cancelled invoice status (L108–117).

---

## Gerar button: last point it exists vs first point it is lost

### Histórico

| Point | State |
|-------|-------|
| **Last point button exists** | `HistoryRowChargeAction` render when `historyRowShowsChargeAction(row) === true` (`HistoryRowChargeAction.tsx:21–42`) |
| **First point button lost (no event path)** | `emitEventsForCycleRow` emits nothing → cycle absent from `realEvents` → absent from `getHistoryRows` |
| **First point button lost (event exists)** | `cycleSupportsManualGenerate` → `canGenerateNow: false` (Store L169) OR `FinancialHistoryRow` `!canGenerateNow` (L35) |

### Calendário

| Point | State |
|-------|-------|
| **Last point** | `InvoiceDirectActions` with `generate_now` (`InvoiceDirectActions.tsx:71–86`) |
| **First loss** | `isProjectedFinancialEvent(ev)` → `showBillingActions: false` (`FinancialCalendarPopover.tsx:35–37`) OR `supportsGenerate: false` |

---

## Architecture: Single Source of Truth compliance

| Claim (4.2G) | Actual (proven) | Verdict |
|--------------|-----------------|--------|
| Events only from `cycles_raw` | `buildFinancialEvents` iterates `listCyclesFromDetail` only | **TRUE** for `realEvents` |
| Every real event has `cycleId` | `pushEvent` requires `cycleId: string` | **TRUE** |
| No projection in billing | Projections in `events[]` for calendar/KPI | **FALSE** for display layer |
| History = billing source | History from `realEvents`, not raw cycles | **TRUE** but **indirect** — depends on emission |
| One event per cycle | Multiple events per cycle; History dedupes to one | **FALSE** |

**Parallel pipelines still active:**

1. `buildProjectionEvents` — `next_billing_date` / `buildFutureCycles` (4.2H)
2. `detail.timeline` — influences `operational_state` when matched in `timelineRowForCycle`
3. Backend `getRenewalDiagnosis` — `SubscriptionRenewalActionsCard`

---

## Proof: generation vs rendering

| Scenario | Event generated? | `canGenerateNow` | Gerar in History? | Conclusion |
|----------|------------------|------------------|-------------------|------------|
| `pending`, no invoice | YES `upcoming_cycle` | true | YES | Both layers pass — test L108–113 |
| `invoiced` | YES `invoice_due` | false | NO | **Generation OK; gate blocks** — test L116–132 |
| Official `cancelled`, past | **NO** | N/A | NO | **Generation blocks** — cannot be fixed by render alone |
| Projected month | YES projected | false (not in history) | NO | **Parallel pipeline** — test L144–148 |
| `processing` | YES likely `upcoming_cycle`⁴ | **false** | NO | **Render/gate blocks** despite event |

**Conclusion:** Gerar disappearance is **caused by event emission gaps AND render gates**; emission gap is the **primary** cause when `cycles_raw` contains a cycle with no corresponding History row.

---

## References

| Document | Relation |
|----------|----------|
| `BILLING_GENERATE_ACTION_FORENSIC.md` (4.2L) | Visibility pipeline per component |
| `BILLING_LIFECYCLE_FORENSIC.md` (4.2K) | DB cycle materialization |
| `BILLING_CYCLE_IDENTITY_CERTIFICATION.md` (4.2G) | `cycle_id` rules |

---

## Sprint 4.2M definition of done

| Criterion | Status |
|-----------|--------|
| No code changes | ✓ |
| Forward + reverse trace | ✓ |
| All mandatory questions | ✓ |
| Three required tables | ✓ |
| Runtime checks | ✓ (static + vitest) |
| Single primary root cause | ✓ |
| First fidelity loss point | ✓ `emitEventsForCycleRow` |
| SSOT assessment | ✓ Partial + parallel pipelines listed |
| Hypotheses marked NOT PROVEN | ✓ |
