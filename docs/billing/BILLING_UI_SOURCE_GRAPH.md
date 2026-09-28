# BILLING_UI_SOURCE_GRAPH — Sprint 4.2G

Single canonical data flow for subscription financial UI.

```mermaid
flowchart TD
  SC[subscription_cycles DB]
  API[GET subscription detail]
  CR[cycles_raw payload]
  TL[timeline enrichment]
  BFE[subscriptionFinancialEventBuilder.buildFinancialEvents]
  FES[FinancialEventStore]
  CAL[FinancialCalendar]
  HIS[FinancialHistory]
  SB[FinancialSummarySidebar]
  NI[NextInvoiceCard / resolveNextChargePresentation]
  GEN[executeDeterministicGenerateRenewal]
  API2[POST manual-renew cycle_id]
  BE[Billing Engine generateInvoiceForCycle]

  SC --> API
  API --> CR
  CR --> BFE
  TL --> BFE
  BFE --> FES
  FES --> CAL
  FES --> HIS
  FES --> SB
  FES --> NI
  CAL -->|Gerar click + cycleId| GEN
  HIS -->|Gerar click + cycleId| GEN
  SB -->|Gerar click + cycleId| GEN
  NI -->|Gerar click + cycleId| GEN
  GEN --> API2
  API2 --> BE
```

## Forbidden paths (removed)

```
next_billing_date ──X──> FinancialEvent (projection)
buildFutureCycles() ──X──> FinancialEvent
dueYmd heuristic ──X──> cycle resolution
earliest / next-charge fallback ──X──> generate payload
```

## Module map

| Layer | Module |
|-------|--------|
| Cycle source | `subscriptionCyclesSource.ts` |
| Event builder | `subscriptionFinancialEventBuilder.ts` |
| Event store | `subscriptionFinancialEventStore.ts` |
| Next charge | `subscriptionFinancialEvents.ts`, `subscriptionNextInvoiceResolver.ts` |
| Generation | `subscriptionBillingGeneration.ts` |
| Capabilities | `invoiceCapabilities.ts` (requires `cycleId` for `supportsGenerate`) |

## Parity rule

Every competency visible in Calendar, History, Sidebar, and Next Invoice must correspond to exactly one row in `cycles_raw` with a non-null `id` used as `cycle_id` on events and generate actions.
