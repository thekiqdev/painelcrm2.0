# Audit 5 — State Machine Parity (Sprint 4.2F)

**Mode:** READ ONLY  
**Goal:** Compare DB, backend SM, frontend SM, and UI surfaces.

---

## Status vocabulary

### `subscription_cycles.status` (DB CHECK)

`pending` | `queued` | `processing` | `invoiced` | `skipped` | `failed` | `cancelled`

**Not in DB:** `awaiting_generation`, `paid`, `awaiting_generation` is **operational_state** (timeline UX).

### `operational_state` (timeline UX only)

Includes: `awaiting_generation`, `scheduled`, `skipped`, `failed`, `paid`, `generated`, `cancelled`, `lifecycle_event`, etc.

---

## Generate eligibility by state

| State | DB | Backend `GENERATABLE_CYCLE_STATUSES` | Backend `resolveBillingCycleState.canGenerate` | Frontend `resolveFinancialEventState` (events) | UI generate button |
|-------|-----|--------------------------------------|-----------------------------------------------|-----------------------------------------------|-------------------|
| `pending` | ✓ | ✓ | ✓ if active + pendingLike | upcoming → canGenerate true | Calendar/Next/History* |
| `queued` | ✓ | ✓ | ✓ (pendingLike) | upcoming → true | ✓ |
| `failed` | ✓ | ✓ | ✓ if recoverable future; else failed | invoice_failed → false | Resolve/reprocess |
| `skipped` (recoverable) | ✓ | ✓ | ✓ → awaiting_generation | upcoming_cycle | ✓ |
| `skipped` (non-recoverable) | ✓ | ✓ | skipped state | may be invoice_failed | ✗ |
| `cancelled` (legacy false) | ✓ | ✓ | ✓ → awaiting_generation | upcoming_cycle | ✓ |
| `cancelled` (official) | ✓ | ✓ | cancelled | cancelled / no event | ✗ |
| `processing` | ✓ | **✗** | unknown / blocked | N/A | ✗ |
| `invoiced` | ✓ | **✗** | pending_invoice if invoice linked | invoice_due | Open only |
| `paid` | via invoice | N/A | paid | payment | ✗ |
| `awaiting_generation` | op state | N/A | via pendingLike | upcoming_cycle | ✓ |
| Projected (no DB) | — | N/A | N/A | upcoming_cycle | ✓ **but no cycle_id** |

\*Histórico only for next charge row.

---

## Backend vs frontend state machine differences

| Rule | Backend `billingStateMachine.ts` | Frontend `billingStateMachine.ts` |
|------|----------------------------------|-----------------------------------|
| Legacy false cancelled | `cycleStatus === 'cancelled'` only | Also checks `operationalState === 'cancelled'` |
| `canGenerate` for past pending | `due >= today` in pendingLike branch | `upcoming_cycle` → **always** `canGenerate: true` |
| Event-level state | N/A | `resolveFinancialEventState` ignores `cycleStatus` |
| Timeline normalization | N/A | `normalizeTimelineRowForStateMachine` rewrites false cancelled → awaiting |

**Impact:** Calendar may show generate for past `upcoming_cycle` (frontend `canGenerate: true`) while backend would only bill if `cycle_id` sent and cycle status eligible.

---

## Skipped vs cancelled audit (Audit 5)

### Skipped

| Layer | Behavior |
|-------|----------|
| DB | `status = skipped`, `skipped_reason` set |
| Timeline UX | If recoverable → `operational_state = awaiting_generation`, label "Prevista" |
| Event builder | Emits `upcoming_cycle` when skipped + no invoice |
| Backend generate | Allowed (in GENERATABLE set) |
| 4.2C fix | No `invoice_cancelled` without invoice |

### Cancelled

| Layer | Behavior |
|-------|----------|
| DB | `status = cancelled` |
| Legacy recovery | False cancelled → awaiting_generation (4.2B/4.2C) |
| Official cancel markers | `OFFICIAL_CYCLE_CANCEL_MARKERS` → stays cancelled |
| Backend generate | Allowed **only** when no invoice + legacy false cancelled |

### Paid

Not a cycle status — `invoice.status = paid` → `payment` event, no generate.

---

## Surface parity matrix

| Surface | State source | `cycle_id` source | Next charge logic |
|---------|--------------|-------------------|-------------------|
| `subscription_cycles` | DB status | DB id | N/A |
| `cycles_raw` | DB | DB id | N/A |
| Timeline | operational_state + cycle_status | cycle row / null | N/A |
| FinancialEventStore | event types | event.cycleId | `resolveNextChargeEvent` |
| Histórico | history row state | row.cycleId | **only next row shown** |
| Calendário | event type + capabilities | ev.cycleId | per day |
| Sidebar | next presentation | next.cycleId | next resolver |
| Próxima cobrança | next presentation | next.cycleId | next resolver |

**Parity break:** Calendário shows more `upcoming_cycle` events than Histórico/Sidebar "next" — different subsets of same store.

---

## `legacyCycleRecovery.ts`

Delegates entirely to `normalizeDetailForBillingStateMachine` — no separate identity propagation. Recovery affects **labels/states**, not `cycle_id`.

---

## Conclusion

| Question | Answer |
|----------|--------|
| States allowing generate? | pending, queued, failed (recoverable), skipped (recoverable), cancelled (legacy false) |
| States blocking correctly? | invoiced, processing, paid, official cancelled |
| Misinterpreted states? | Frontend `upcoming_cycle` always canGenerate; projected cycles treated same as DB cycles |
| DB vs UI parity? | **Partial** — UI shows generate without `cycle_id` on projected cycles |
