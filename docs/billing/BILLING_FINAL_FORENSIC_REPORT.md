# Billing Final Forensic Report — Sprint 4.2F

**Mode:** READ ONLY — no functional changes  
**Date:** 2026-07-02  
**Sprints covered:** 4.2D (deterministic backend), 4.2E (UI integration), 4.2F (this audit)

---

## Executive summary

Sprint 4.2D **correctly** implemented deterministic billing on the backend when `cycle_id` is present. Sprint 4.2E **unified** the frontend entry points through `executeDeterministicGenerateRenewal`.

**The remaining defect is not in the billing engine, worker, or scheduler.** It is in **cycle identity propagation** on the frontend: several UI events reach the generate handler with `cycleId: null`, and the resolver **does not** map `dueYmd` back to `cycles_raw[].id` before falling back to "next charge" or "earliest uninvoiced".

Result: the user can click a calendar month (e.g. Outubro) and the system may bill Julho or the canonical next charge instead.

---

## Final questions (mandatory)

### 1. Em qual arquivo o `cycle_id` deixa de existir?

| Priority | File | Mechanism |
|----------|------|-----------|
| **P0** | `src/lib/subscriptionFinancialEventBuilder.ts` (~line 260) | `buildFutureCycles` events forced `cycleId: null` |
| **P0** | `src/lib/billingSubscriptionExperience.ts` (`buildFutureCycles`) | Projects from `next_billing_date`; no UUID |
| **P1** | `packages/backend/src/services/subscriptionTimelineUx.ts` (~line 474 vs 543) | `invoice_only` merge → `cycle_id: null` |
| **P1** | `src/lib/subscriptionBillingGeneration.ts` (~line 80–102) | Drops `dueYmd` when resolving without `cycleId` |
| **P2** | `packages/backend/src/services/subscriptionTimelineUx.ts` (~line 404) | Lifecycle rows (non-billing; excluded from events) |

### 2. Em qual componente a competência é alterada?

Not altered in display — altered at **resolution time**:

| Component / module | Alteration |
|--------------------|------------|
| `resolveOfficialGenerateBillingTarget` | Replaces null `cycleId` with next/earliest |
| `findEarliestUninvoicedCycle` (backend) | Same when HTTP omits `cycle_id` |
| `resolveNextChargeEvent` | Defines "next" ≠ "clicked" for multi-gap subscriptions |

Display components (Calendar, History) show the clicked month correctly; **billing target** changes in `subscriptionBillingGeneration.ts`.

### 3. Existe reconstrução manual de datas?

**Yes.**

| Location | Reconstruction |
|----------|----------------|
| `buildFutureCycles` | `next_billing_date` + `advanceBillingDueYmd` × 12 |
| `buildTimelineRow` | `due` from invoice or cycle_date |
| `cycleKeyFromParts` | `cycleId ?? dueYmd ?? competence` |
| `ensureJobForManualGenerate` | Fallback `cycleKey` from `join.next_billing_date` |

### 4. Existe fluxo ainda utilizando `next_billing_date`?

**Yes** — for projection and fallback, not for explicit `cycle_id` path:

- `buildFutureCycles` (calendar dots without DB cycle)
- `ensureJobForManualGenerate` when `cycleKey` option absent
- `buildSubscriptionAutomationSummary` (display only)

### 5. Payload deixa de representar o `subscription_cycle` do banco?

**Yes**, when:

1. Event is projected (`cycleId: null`)
2. Timeline is `invoice_only` (`cycle_id: null`)
3. `cycles_read_enabled === false` (no cycles in API)
4. Resolver fallback sends different `cycle_id` than clicked `dueYmd`

### 6. É possível gerar qualquer competência existente fora de ordem?

| Condition | Possible? |
|-----------|-----------|
| Backend + explicit `cycle_id` | **Yes** — proven in 4.2D |
| UI click with DB `cycle_id` on event | **Yes** |
| UI click on projected month | **No** |
| UI click with `dueYmd` only | **No** (resolver gap) |
| Histórico for non-next month | **No** (filtered out) |

---

## Root cause (single statement)

> **`cycle_id` is stripped at event construction for projected cycles and invoice-only rows; the unified generate resolver does not recover identity from `dueYmd` + `cycles_raw`, so fallback logic bills the wrong competence.**

---

## Risk matrix

| Risk | Severity | Likelihood |
|------|----------|------------|
| Calendar bills wrong month | **Critical** | High when gaps + projected months |
| History bills wrong month | Medium | Low (single next row; usually has id) |
| Duplicate invoice | Low | Mitigated by DB + validation |
| `cycles_read` disabled | High | Total generate failure (`cycle_required`) |

---

## Recommended fix scope (next sprint — NOT implemented here)

1. **Resolver:** `cycles_raw.find(c => c.cycle_date === dueYmd && !c.invoice_id)` before next/earliest fallback
2. **Event builder:** Attach `cycleId` from `cycles_raw` match when building projected events with matching `dueYmd`
3. **Calendar:** Disable generate when `!ev.cycleId && !cycles_raw match` OR resolve id before showing button
4. **Optional:** Histórico filter — allow generate on any uninvoiced timeline row (product decision)

**Out of scope:** Billing engine, worker, scheduler, gateway, layout.

---

## Deliverables index

| Document | Content |
|----------|---------|
| [BILLING_CYCLE_IDENTITY_AUDIT.md](./BILLING_CYCLE_IDENTITY_AUDIT.md) | Full propagation trace + loss points |
| [BILLING_HISTORY_GENERATION_AUDIT.md](./BILLING_HISTORY_GENERATION_AUDIT.md) | History single-row filter + payload |
| [BILLING_CALENDAR_GENERATION_AUDIT.md](./BILLING_CALENDAR_GENERATION_AUDIT.md) | Calendar null id + date divergence |
| [BILLING_DETERMINISTIC_GENERATION_AUDIT.md](./BILLING_DETERMINISTIC_GENERATION_AUDIT.md) | Test matrix + backend proof |
| [BILLING_STATE_MACHINE_PARITY_AUDIT.md](./BILLING_STATE_MACHINE_PARITY_AUDIT.md) | State eligibility + FE/BE diffs |
| **This report** | Root cause + next sprint scope |

---

## Definition of done (4.2F)

- [x] No functional code changes
- [x] Exact origin of identity loss identified
- [x] All flows documented with file/line evidence
- [x] Root cause supported by code trace
- [x] Next sprint scoped to point fixes only

---

## Auditor note

Runtime manual path (`generateInvoiceForCycle`) is **certified deterministic** when `cycle_id` is provided. The forensic gap is entirely in **frontend identity propagation and resolver fallback**, not in the billing engine execution path.
