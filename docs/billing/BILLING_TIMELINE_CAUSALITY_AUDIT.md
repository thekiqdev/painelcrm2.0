# Billing Timeline Causality Audit — Sprint 4.2N

**Mode:** READ ONLY — no code changes, no commits, no fixes  
**Date:** 2026-07-02  
**Goal:** Determine who builds `detail.timeline`, who defines `operational_state`, and whether this layer alters `subscription_cycles` meaning.

---

## Final verdict

### First point where `operational_state` diverges from `subscription_cycles.status`

**`resolveOperationalState`** in `packages/backend/src/services/subscriptionTimelineUx.ts` (L256–368), invoked by `buildTimelineRow` (L444–453) during `buildSubscriptionTimeline` (L517–526).

This is the **first** transformation in the execution path: raw `cycle.status` from DB enters with invoice and job context and exits as `operational_state` — a **different vocabulary** with **different semantics** (e.g. `cycle.status === 'failed'` + recoverable → `operational_state === 'awaiting_generation'` at L304–307; `cycle.status === 'queued'` → `operational_state === 'scheduled'` at L346–347).

**Second rewrite (frontend only, in-memory):** `normalizeTimelineRowForStateMachine` in `src/lib/billingStateMachine.ts` (L296–315) may change `operational_state` again and rewrite `cycle_status` from `cancelled`/`skipped` to `pending` (L309).

### Is `detail.timeline` only visual?

**NO — PROVEN.** Timeline (specifically `operational_state` on timeline rows) **influences business decisions** on the frontend:

| Consumer | Uses `operational_state` for | File |
|----------|------------------------------|------|
| `emitEventsForCycleRow` | Which `FinancialEvent` types are emitted | `subscriptionFinancialEventBuilder.ts` L120–234 |
| `buildFinancialAlerts` / insights | Alert generation | `subscriptionFinancialExperience.ts` L397–430 |
| `subscriptionFinancialConsistency` | `canGenerate` on enriched receipts | `subscriptionFinancialConsistency.ts` L202–240 |

Timeline is labeled "somente leitura / UX" in backend header (`subscriptionTimelineUx.ts` L1–3) but the frontend **uses it as input to event emission**, not only display.

**Exception:** `canGenerateNow` on History rows uses `cycleSupportsManualGenerate(detail, cycleId)` which reads **`cycles_raw[].status` directly** — bypasses `operational_state` (`subscriptionCyclesSource.ts:59–67`).

### Single state machine or multiple?

**Multiple concurrent state machines — PROVEN:**

| # | Machine | File | Role |
|---|---------|------|------|
| 1 | `resolveOperationalState` | `subscriptionTimelineUx.ts:256` | Backend timeline build → `operational_state` |
| 2 | `resolveBillingCycleState` (backend) | `billingRuntime/billingStateMachine.ts:83` | Used inside #1 for `cancelled`/`skipped` (L311–338) |
| 3 | `resolveBillingCycleState` (frontend) | `src/lib/billingStateMachine.ts:127` | `normalizeTimelineRowForStateMachine`, event state |
| 4 | `cycleSupportsManualGenerate` | `subscriptionCyclesSource.ts:59` | Gerar eligibility from `cycles_raw.status` |
| 5 | `resolveInvoiceCapabilities` | `invoiceCapabilities.ts:57` | Calendar `supportsGenerate` from `eventType` |

They are **not** unified. Same cycle can have `cycles_raw.status = 'cancelled'`, `operational_state = 'awaiting_generation'`, and `canGenerateNow = true` simultaneously (legacy false-cancel path — `legacyCancelledCycleRecovery.test.ts` L60–84).

---

## Mandatory questions — answers

| # | Question | Answer | Evidence |
|---|----------|--------|----------|
| 1 | Quem cria `detail.timeline`? | **`buildSubscriptionTimeline`** called from **`getCrmSubscriptionDetail`** | `crmSubscriptionsService.ts:356–364`; `subscriptionTimelineUx.ts:491` |
| 2 | Quais funções escrevem/transformam `detail.timeline`? | **Create:** `buildSubscriptionTimeline`, `buildTimelineRow`, `buildLifecycleTimelineRow`. **Transform (frontend, in-memory):** `normalizeDetailForBillingStateMachine`, `normalizeTimelineRowForStateMachine` | `subscriptionTimelineUx.ts`; `billingStateMachine.ts:318–330` |
| 3 | Quem define `operational_state`? | **`resolveOperationalState`** (primary); lifecycle rows hardcode `lifecycle_event` | `subscriptionTimelineUx.ts:256–368`, L397 |
| 4 | `operational_state` derivado de `subscription_cycles.status` ou pode divergir? | **Pode divergir** — derived from status + invoice + job + dates + backend SM | `resolveOperationalState` entire function |
| 5 | Onde `operational_state` pode ser reescrito? | (1) Backend `resolveOperationalState`; (2) Frontend `normalizeTimelineRowForStateMachine` | L296–315 `billingStateMachine.ts` |
| 6 | `timelineRowForCycle` prioriza timeline ou cycles? | **Prioriza `detail.timeline`**; fallback `cycleToTimelineRow(cycle)` | `subscriptionCyclesSource.ts:69–90` |
| 7 | Conflito timeline vs cycles — quem vence? | **`detail.timeline` vence** when matched by `cycle_id`, `invoice_id`, or date | `subscriptionCyclesSource.ts:73–88` |
| 8 | Fallback substitui cycles por timeline? | **Partial:** if no timeline match, `cycleToTimelineRow` synthesizes row **from cycle only** (simpler `operational_state`) | `subscriptionCyclesSource.ts:90–140` |
| 9 | Cache envolvendo timeline? | **Frontend:** `FinancialEventStore` caches derived views (`_historyCache`); `financialEventStoreSignature` includes timeline fields for React invalidation. **Backend request cache:** NOT PROVEN | `subscriptionFinancialEventStore.ts:91–97`, L453–457 |
| 10 | Normalização posterior do timeline? | **YES** — `normalizeDetailForBillingStateMachine` before `buildFinancialEvents` | `subscriptionFinancialEventBuilder.ts:253` |
| 11 | Módulos que consomem timeline diretamente? | See Consumers table | grep `detail.timeline` |
| 12 | Módulos que consomem `subscription_cycles` diretamente? | `listCyclesFromDetail`, `cycleSupportsManualGenerate`, `resolveFirstEligibleCycle`, technical accordion | `subscriptionCyclesSource.ts` |
| 13 | Ciclo com status DB ≠ `operational_state` no frontend? | **YES — PROVEN** | `legacyCancelledCycleRecovery.test.ts` L60–84: `status:'cancelled'` → `operational_state:'awaiting_generation'` |
| 14 | Timeline válido após `subscription_cycles` mudar? | Cada `GET` detail rebuilds both from DB atomically. **Stale client payload:** NOT PROVEN as split-brain (both fields same response) | `crmSubscriptionsService.ts:337–392` |
| 15 | Duplicidade de máquinas de estado backend/frontend? | **YES** — separate files, similar names, divergent rules | See verdict table above |

---

## Trace 1 — Timeline Build Trace

```
subscription_cycles (DB)
    │ listSubscriptionCyclesBySubscriptionId
    ▼
cycles[] + invRows[] + recent_jobs[] + lifecycle_events[]
    │ getCrmSubscriptionDetail — crmSubscriptionsService.ts:337-364
    ▼
buildSubscriptionTimeline()                    subscriptionTimelineUx.ts:491
    │ for each cycle:
    │   findJobForRow → job context
    │   buildTimelineRow → resolveOperationalState   ★ FIRST divergence
    │ for each orphan invoice: merge_source invoice_only
    │ for each lifecycle event: lifecycle_event
    ▼
detail.timeline[]  +  detail.cycles_raw[] (= cycles[], unchanged)
    │ HTTP GET subscription detail
    ▼
normalizeDetailForBillingStateMachine()      billingStateMachine.ts:318-330
    │ normalizeTimelineRowForStateMachine per row  ★ SECOND divergence
    ▼
for each cycle in listCyclesFromDetail(cycles_raw):
    timelineRowForCycle(detail, cycle)         subscriptionCyclesSource.ts:69-90
    │ timeline match wins over cycleToTimelineRow
    ▼
emitEventsForCycleRow(cycle, row)            subscriptionFinancialEventBuilder.ts:67-243
    │ branches on row.operational_state
    ▼
FinancialEvent[] (realEvents)
```

---

## Trace 2 — Status Divergence Trace

```
subscription_cycles.status (DB)
    e.g. 'cancelled', 'failed', 'queued', 'pending'
    ▼
resolveOperationalState(cycleStatus, inv, job, ...)   subscriptionTimelineUx.ts:256
    ▼
operational_state on timeline row
    e.g. 'awaiting_generation', 'scheduled', 'failed', 'paid'
    ▼
normalizeTimelineRowForStateMachine (optional)      billingStateMachine.ts:296
    may rewrite operational_state + cycle_status on timeline copy
    ▼
timelineRowForCycle → row passed to emitEventsForCycleRow
    ▼
FinancialEvent.type
    e.g. operational_state 'failed' → invoice_failed OR upcoming_cycle (recoverable)
    operational_state 'awaiting_generation' → upcoming_cycle
    ▼
getHistoryRows → canGenerateNow = cycleSupportsManualGenerate(cycles_raw.status)
    ★ DIVERGENCE: event type from operational_state; Gerar flag from raw status
    ▼
FinancialHistoryRow → Calendar via FinancialEventStore.events
```

---

## Table 1 — Timeline Ownership

| Etapa | Arquivo | Função | Entrada | Saída | Pode alterar estado? |
|-------|---------|--------|---------|-------|----------------------|
| 1. DB read | `subscriptionCyclesQueryService.ts` | `listSubscriptionCyclesBySubscriptionId` | `subscription_cycles` | `SubscriptionCycleDbRow[]` | No (read) |
| 2. Detail assembly | `crmSubscriptionsService.ts` | `getCrmSubscriptionDetail` | cycles, invoices, jobs, lifecycle | `CrmSubscriptionDetail` | No |
| 3. Timeline build | `subscriptionTimelineUx.ts` | `buildSubscriptionTimeline` | cycles, invoices, jobs | `CrmSubscriptionTimelineRowUx[]` | **Yes** — creates `operational_state` |
| 4. Row build | `subscriptionTimelineUx.ts` | `buildTimelineRow` | cycle + inv + job | single timeline row | **Yes** via `resolveOperationalState` |
| 5. Op state resolve | `subscriptionTimelineUx.ts` | `resolveOperationalState` | `cycle.status`, inv, job | `operational_state` | **Yes** — primary |
| 6. SM consult (partial) | `billingRuntime/billingStateMachine.ts` | `resolveBillingCycleState` | cancelled/skipped input | SM state | **Yes** — influences #5 |
| 7. Invoice-only rows | `subscriptionTimelineUx.ts` | `buildSubscriptionTimeline` L530–550 | invoices without cycle | `merge_source:'invoice_only'` | **Yes** — `manual_invoice` |
| 8. Lifecycle rows | `subscriptionTimelineUx.ts` | `buildLifecycleTimelineRow` | pause/resume/reactivate | `lifecycle_event` | **Yes** |
| 9. Payload | `crmSubscriptionsService.ts` | return | — | `timeline` + `cycles_raw` | No |
| 10. Frontend normalize | `billingStateMachine.ts` | `normalizeDetailForBillingStateMachine` | `detail.timeline` | timeline copy | **Yes** — rewrites rows |
| 11. Row resolve for events | `subscriptionCyclesSource.ts` | `timelineRowForCycle` | cycle + `detail.timeline` | `CrmSubscriptionTimelineRow` | **Selects** timeline over cycle |
| 12. Fallback row | `subscriptionCyclesSource.ts` | `cycleToTimelineRow` | `cycles_raw` only | synthetic timeline row | **Yes** — simpler op mapping |
| 13. Event emission | `subscriptionFinancialEventBuilder.ts` | `emitEventsForCycleRow` | cycle + row | `FinancialEvent[]` | **Yes** — event types |

---

## Table 2 — Status Comparison

| `subscription_cycles.status` | `operational_state` (typical) | Origem | Pode divergir? | Quem decide? |
|------------------------------|-------------------------------|--------|----------------|--------------|
| `pending` | `awaiting_generation` | `resolveOperationalState` L349–354 | **Yes** (different string) | `subscriptionTimelineUx.ts` |
| `queued` | `scheduled` | L346–347 | **Yes** | same |
| `processing` | `processing` | L340–341 (or job `processing`) | Sometimes (job-driven) | same |
| `invoiced` | `generated` / `paid` / `gateway_failed` | L276–294 if invoice linked | **Yes** | invoice status dominates |
| `skipped` | `skipped` OR `awaiting_generation` | L325–338 + backend SM | **Yes** | `resolveOperationalState` + `resolveBillingCycleState` |
| `failed` | `failed` OR `awaiting_generation` | L304–308 (recoverable) | **Yes** | recoverable flag + due date |
| `cancelled` | `cancelled` OR `awaiting_generation` | L310–323 | **Yes** — **PROVEN** test L60–84 | legacy vs official cancel |
| *(no cycle)* | `manual_invoice` | invoice-only row | N/A | `merge_source:'invoice_only'` |
| *(lifecycle)* | `lifecycle_event` | lifecycle API | N/A | `buildLifecycleTimelineRow` |

**`cycle_status` on timeline row** preserves original DB status (`buildTimelineRow` L473: `cycle_status: cycle?.status`). Divergence is in **`operational_state`**, not removal of `cycle_status`.

---

## Table 3 — Consumers

| Módulo | Lê `subscription_cycles` / `cycles_raw` | Lê `timeline` | Lê `operational_state` | Observações |
|--------|----------------------------------------|-----------------|------------------------|-------------|
| `buildFinancialEvents` | **Yes** (iterate cycles) | **Yes** via `timelineRowForCycle` | **Yes** (emission guards) | Cycles drive loop; timeline drives row semantics |
| `cycleSupportsManualGenerate` | **Yes** (`cycles_raw.status`) | No | No | Gerar flag bypasses timeline |
| `resolveFirstEligibleCycle` | **Yes** | No | No | Next charge from raw cycles |
| `normalizeDetailForBillingStateMachine` | No | **Yes** (mutates) | **Yes** | In-memory only |
| `subscriptionFinancialExperience` | No | **Yes** | **Yes** | Alerts, insights, KPIs legacy paths |
| `billingSubscriptionExperience` | No | **Yes** | **Yes** | Headline status, open counts |
| `billingSubscriptionExperiencePolish` | No | **Yes** | Partial | Polish helpers |
| `subscriptionFinancialConsistency` | No | **Yes** | **Yes** | Legacy consistency layer |
| `subscriptionRenewalRecovery` | No | **Yes** | Partial | Worker history from timeline |
| `subscriptionNextInvoiceResolver` | **Yes** | **Yes** via `timelineRowForCycle` | Indirect | Tracks `fromTimeline` vs `cycles_raw` |
| `resolveNextChargePresentation` | **Yes** | **Yes** (period bounds) | No | `timeline.find(cycle_id)` L143 |
| `FinancialTechnicalAccordion` | **Yes** (display JSON) | No | No | Debug UI |
| `buildProjectionEvents` | **Yes** (occupied dates only) | No | No | Does not use `operational_state` |
| `getCrmSubscriptionDetail` (backend) | **Yes** (source) | **Creates** | **Creates** | Single API response |

---

## Runtime checks

| Check | Result | Evidence |
|-------|--------|----------|
| Todo timeline tem origem rastreável? | **Mostly YES** — cycle rows from `buildTimelineRow`; `invoice_only` from orphan invoices; `lifecycle` from events | `buildSubscriptionTimeline` L504–555 |
| Reescritas de `operational_state`? | **YES** — backend build + frontend normalize | L256–368; `billingStateMachine.ts:296–315` |
| Conflitos status DB vs `operational_state`? | **YES — PROVEN** | `legacyCancelledCycleRecovery.test.ts` L83–84 |
| Consumidores exclusivos de timeline? | **YES** — `billingSubscriptionExperience`, `subscriptionFinancialExperience` (alerts) | grep results |
| Consumidores exclusivos de `cycles_raw`? | **YES** — `cycleSupportsManualGenerate`, `resolveFirstEligibleCycle` | `subscriptionCyclesSource.ts` |
| Timeline prevalece sobre cycles? | **YES** when `timelineRowForCycle` finds match | `subscriptionCyclesSource.ts:73–74` |

### When `cycles_read_enabled` is false

`cycles = []` → `cycles_raw: []` → timeline built **only** from invoices + lifecycle (`subscriptionTimelineUx.ts` L504 — cycle loop skipped). **PROVEN** by guard `if (cyclesReadEnabled && cycles.length > 0)`.

### `invoice_only` timeline rows

Rows with `merge_source: 'invoice_only'`, `cycle_id: null` (`buildTimelineRow` with `cycle: null` L542–548). **No `subscription_cycle`** — timeline entry without cycle backing.

### Event emission uses timeline, not raw status

Example — `emitEventsForCycleRow` L120: `if (row.operational_state === 'failed')` — not `cycle.status === 'failed'`.

Example — L218–234: upcoming emission checks `row.operational_state` values, not `cycle.status` directly.

**Exception:** `cycle.status === 'skipped'` also checked at L232.

### Duplication: same cycle, timeline vs `cycleToTimelineRow`

If `detail.timeline` row exists for `cycle_id`, it is used (rich `operational_state` from backend). If absent, `cycleToTimelineRow` produces simpler mapping (`subscriptionCyclesSource.ts:94–140`). **Same `cycles_raw` cycle can yield different `operational_state`** depending on whether timeline row exists — **PROVEN** by code path split.

### Discarded timeline rows

`merge_source === 'lifecycle'` excluded from some financial paths (`billingSubscriptionExperience.ts:339`, `financialEventStoreSignature` L454). Lifecycle rows **do not** produce `FinancialEvent`s via cycle loop (no `cycle_id`).

---

## Relationship to Gerar button (cross-reference 4.2L/4.2M)

| Path | Source for visibility |
|------|----------------------|
| History `canGenerateNow` | `cycles_raw.status` via `cycleSupportsManualGenerate` |
| `FinancialEvent` emission | `operational_state` from timeline row |
| Calendar `supportsGenerate` | `FinancialEvent.type` (derived from operational_state) |

**Therefore:** A cycle can **emit** `upcoming_cycle` (operational_state `awaiting_generation`) while `canGenerateNow` is false (`processing` ∉ generatable), or **fail to emit** while `canGenerateNow` is true if emission guards fail but status is generatable — **dual-path inconsistency PROVEN** by separate readers.

---

## Architecture assessment

| Claim | Verdict |
|-------|---------|
| `cycles_raw` is billing SSOT for cycle identity | **TRUE** for `cycle_id` / API |
| `timeline` is display-only | **FALSE** — drives `emitEventsForCycleRow` |
| `operational_state` ≡ `subscription_cycles.status` | **FALSE** — different enum, mapping rules |
| Single state machine | **FALSE** — 5+ decision paths |
| One path cycle → FinancialEvent | **FALSE** — cycle → timelineRowForCycle → row → 0..N events |

---

## Hypotheses marked NOT PROVEN

| Hypothesis | Status |
|------------|--------|
| Backend caches timeline between HTTP requests | **NOT PROVEN** |
| Client can have fresh `cycles_raw` with stale `timeline` from different requests | **NOT PROVEN** (same payload object) |
| `detail.timeline` is mutated after normalize in production UI | **NOT PROVEN** beyond `buildFinancialEvents` call chain |
| Every `subscription_cycles` row always has matching `timeline` row | **NOT PROVEN** — built in same loop, but `invoice_only` rows have no cycle |

---

## Sprint 4.2N definition of done

| Criterion | Status |
|-----------|--------|
| No code changes | ✓ |
| Timeline builder identified | ✓ `buildSubscriptionTimeline` |
| `operational_state` owner identified | ✓ `resolveOperationalState` |
| First divergence point | ✓ `subscriptionTimelineUx.ts:256` |
| Visual vs business influence | ✓ Influences event emission |
| Single vs multiple state machines | ✓ Multiple |
| All tables + traces | ✓ |
| NOT PROVEN where applicable | ✓ |

---

## File index

| File | Role |
|------|------|
| `packages/backend/src/services/subscriptionTimelineUx.ts` | Timeline + `operational_state` builder |
| `packages/backend/src/services/crmSubscriptionsService.ts` | API assembly |
| `packages/backend/src/billingRuntime/billingStateMachine.ts` | Backend SM (partial) |
| `src/lib/subscriptionCyclesSource.ts` | `timelineRowForCycle`, `cycleToTimelineRow` |
| `src/lib/billingStateMachine.ts` | Frontend normalize + SM |
| `src/lib/subscriptionFinancialEventBuilder.ts` | Event emission from timeline row |
| `packages/backend/src/services/legacyCancelledCycleRecovery.test.ts` | Divergence proof test |
