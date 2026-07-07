# Sprint 5.0-21D — Billing Residual Alignment

**Modo:** IMPLEMENTATION (FINAL_ALIGNMENT)  
**Base:** Sprint 5.0-21C + Billing Architecture Specification 4.2R  
**Status:** Concluída — apta para **5.0-21E Final Shadow Certification**

## Objetivo

Eliminar as 43 divergências remanescentes identificadas na Sprint 5.0-21C, mantendo integralmente a arquitetura 4.2R (pipeline linear, zero timeline, zero motor legado).

## Resultado Shadow Certification

| Métrica | 5.0-21B (antes) | 5.0-21D (depois) | Meta |
|---------|-----------------|------------------|------|
| `overallParityPercent` | 95,7% | **99,2%** | ≥99% |
| `historyParityPercent` | 100% | **100%** | 100% |
| `nextInvoiceParityPercent` | 100% | **100%** | 100% |
| `capabilitiesParityPercent` | 100% | **100%** | 100% |
| `eventsParityPercent` | 92,5% | **100%** | ≥99% |
| `calendarParityPercent` | 94,4% | **100%** | ≥99% |
| `sidebarParityPercent` | 93,8% | **100%** | ≥99% |
| `alertsParityPercent` | 77,5% | **90,0%** | ≥99% |
| Divergências totais | 43 | **8** | — |

**Cutover recommendation:** `READY_WITH_CORRECTIONS` → **8 divergências intencionais** (lifecycle alerts).

## RC-1 — Invoice-aware Aggregate ✅

- `invoices[]` adicionado a `CrmSubscriptionDetailPayload` e exposto pelo backend (`crmSubscriptionsService`)
- `invoiceSnapshot.ts` — mapeamento ingress → `BillingInvoiceSnapshot`
- `cycleStage` popula `aggregate.invoices` (sem nova stage)
- Fixtures Golden derivam `invoices[]` via `invoicesFromTimeline` + `supplementInvoicesFromCycles`
- Paid/refunded corretamente mapeados → evento `payment` / `invoice_refunded` (elimina falso `invoice_due`)

## RC-2 — Multiple Financial Events ✅

- `financialEventSnapshot.ts` reescrito: **N eventos por ciclo** (IDs determinísticos)
- Tipos emitidos: `payment`, `invoice_refunded`, `invoice_failed`, `manual_charge`, `invoice_generated`, `invoice_due`, `upcoming_cycle`, `cycle_skipped`, `cycle_cancelled`
- Ordenação determinística: `dueYmd asc`, `id asc`
- `historySnapshot.ts` — dedupe **1 row/ciclo** por prioridade de tipo (paridade `getHistoryRows`)

## RC-3 — Gateway Status ✅

- `gateway_failed` derivado exclusivamente de `invoice.status` + `gateway_status`
- Sem `operational_state` / timeline

## RC-4 — Alert Alignment ✅

- `client_overdue` para pending retroativo (cycles + invoices)
- `invoice_only` via `invoices[]` (sem eventos órfãos — paridade legado)
- **Decisão lifecycle (documentada):** alertas derivados de linhas lifecycle na timeline **não são replicados** — alinhado à constituição 4.2R (proíbe timeline como decisor). **8 divergências intencionais** aceitas.

## Derived Views ✅

- Sidebar: `KPI_OPEN_TYPES` equivalente (`invoice_due`, `invoice_generated`, `manual_charge`)
- Calendar: multi-evento integrado via `buildCalendarFromEvents`
- Consistência Events ↔ History ↔ Calendar certificada

## Arquivos principais

| Arquivo | Mudança |
|---------|---------|
| `invoiceSnapshot.ts` | **Novo** — ingress invoices |
| `financialEventSnapshot.ts` | Multi-emissão invoice-aware |
| `historySnapshot.ts` | Dedupe por ciclo + tipos expandidos |
| `alertsSnapshot.ts` | invoices[] + overdue retroativo |
| `BillingAggregateBuilder.ts` | cycleStage + invoices; financialEvent/alert stages |
| `crmSubscriptions.ts` | `CrmSubscriptionInvoiceSnapshot` + `invoices[]` |
| `crmSubscriptionsService.ts` | Wire API invoices |
| `subscriptionInvoicesFixture.ts` | **Novo** — fixtures Golden |
| `residualAlignment.test.ts` | **Novo** — testes RC-1..RC-4 |

## Isolamento preservado

- Zero imports do motor legado
- Zero `detail.timeline` como decisor
- Pipeline inalterado (ordem e stages)
- Shadow Runtime inalterado
- UI React inalterada

## Divergências remanescentes (8) — intencionais

| Cenários | Superfície | Causa | Decisão |
|----------|------------|-------|---------|
| subscription-paused/resumed/reactivated, timeline-without-cycle | alerts | Legacy usa `timeline` lifecycle como overdue | **Aceito** — 4.2R proíbe timeline; Product mantém arquitetura |

## Testes

```bash
npm run test:billing   # 720 passed
```

Inclui Golden Dataset, Certification Suite, Regression 4.2K–4.2Q, Shadow Runtime, Shadow Certification e `residualAlignment.test.ts`.

## Próxima Sprint (5.0-21E)

**Billing Final Shadow Certification** — laudo formal com `overallParityPercent` ≥99% (atingido: 99,2%) e documentação das 8 divergências lifecycle aceitas. Base para autorizar Cutover (5.0-22).
