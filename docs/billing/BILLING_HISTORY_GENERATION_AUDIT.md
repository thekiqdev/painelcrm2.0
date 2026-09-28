# Audit 2 — History Generation (Sprint 4.2F)

**Mode:** READ ONLY  
**Goal:** Verify whether Histórico uses the correct `cycle_id` when generating.

---

## Flow trace

```
FinancialHistoryRow
  ← financialEventToHistoryRow (subscriptionFinancialEvents.ts)
  ← FinancialEventStore.getHistoryRows (subscriptionFinancialEventStore.ts)
  ← resolveHistoryRowState (billingStateMachine.ts)
  ← HistoryRowChargeAction → onGenerateBilling(row)
  ← SubscriptionDetail.handleGenerateBilling
  ← executeDeterministicGenerateRenewal
  ← POST /manual-renew { cycle_id }
```

---

## What Histórico actually shows

`getHistoryRows()` applies a **hard filter** (`subscriptionFinancialEventStore.ts:147–148`):

```typescript
// Histórico exibe apenas a próxima cobrança prevista; demais ficam no calendário.
if (ev.type === 'upcoming_cycle' && ev.id !== nextChargeId) continue;
```

**Finding:** Histórico lists **at most one** `upcoming_cycle` row — the one returned by `resolveNextChargeEvent`. All other uninvoiced competencies (Julho atrasado, competências intermediárias) are **excluded from Histórico** and only appear in Calendário.

---

## Generate button visibility

| Condition | Source | Result |
|-----------|--------|--------|
| Row is `nextChargeId` | `getHistoryRows:158` | `canGenerateNow: true` (initial) |
| State machine | `resolveHistoryRowState:266–269` | `showGenerateButton` requires `awaiting_generation` + no invoice |
| `isNextCharge` flag | Required OR `canGenerateNow` OR `base.canGenerate` | Past next-charge rows not in table anyway |

For the **single** history row that can show "Gerar cobrança":

- `cycleId` comes from `ev.cycleId` → `row.cycle_id` from timeline when cycle exists
- `handleGenerateBilling(row)` passes `row.cycleId` via `resolveGenerateBillingCycleId(..., row?.cycleId)`

---

## Payload validation (history path)

| Field | When timeline has DB cycle | When cycle missing |
|-------|---------------------------|-------------------|
| `componentName` | `FinancialHistoryRow` (via row path) | same |
| `row.cycleId` | ✓ UUID from timeline | **undefined** |
| `target.dueYmd` | not sent (row path) | — |
| Resolved `cycle_id` | explicit from row | fallback → next charge → earliest |
| HTTP `cycle_id` | ✓ when row has id | **may differ from row displayed** |

---

## Competência clicada vs faturada

### Scenario A — Next charge in history with `cycle_id` (Julho, DB row exists)

| Step | Value |
|------|-------|
| Displayed competence | Julho (`ev.competence`) |
| `row.cycleId` | `cycle-jul` UUID |
| Payload | `{ cycle_id: "cycle-jul" }` |
| Backend | `getSubscriptionCycleById` → Julho |
| **Match** | ✓ YES |

### Scenario B — Next charge in history, `cycle_id` null (invoice_only / projection)

| Step | Value |
|------|-------|
| Displayed competence | Julho (label) |
| `row.cycleId` | null |
| Fallback | `resolveNextChargeCycleFromDetail` or earliest |
| **Match** | ⚠ ONLY if fallback resolves same date |

### Scenario C — Julho uninvoiced but Agosto is "next charge"

Julho **not in history table** (filtered out). User cannot click Gerar on Julho in Histórico — must use Calendário.

**Finding:** Histórico does **not** support generating non-next competencies by design (filter), not by missing `cycle_id` alone.

---

## Why Histórico "works" for some cases

Histórico appears correct when:

1. The uninvoiced competence **is** the next charge (`resolveNextChargeEvent` picks earliest eligible upcoming)
2. That timeline row has `cycle_id` from `subscription_cycles`
3. Row passes `resolveHistoryRowState` → button visible

Histórico **cannot** generate competências that are not the canonical "next charge" — those are calendar-only.

---

## Evidence files

| File | Line(s) | Role |
|------|---------|------|
| `subscriptionFinancialEventStore.ts` | 139–168 | History filtering + `canGenerateNow` |
| `subscriptionFinancialEvents.ts` | 88–109 | `cycleId` on row |
| `SubscriptionDetail.tsx` | 168–196 | `executeDeterministicGenerateRenewal` |
| `subscriptionBillingGeneration.ts` | 134–155 | Resolver + API call |

---

## Conclusion

| Criterion | Status |
|-----------|--------|
| Histórico sends `cycle_id` when row has it | ✓ Proven |
| Histórico always represents clicked competence | ✓ Only one row clickable |
| Histórico can generate arbitrary past month | ✗ **By design excluded** |
| Risk when `cycle_id` null on next row | ⚠ Fallback may pick different cycle |
