# Sprint 5.0-21B — Billing Shadow Semantic Alignment

**Branch:** `feature/billing-shadow-alignment`  
**Commit:** `feat(billing): align Aggregate semantics to legacy Shadow divergences`  
**Status:** Concluída (paridade parcial — pronta para re-certificação 5.0-21C)

## Objetivo

Alinhar semanticamente o `BillingAggregate` ao comportamento oficial do `FinancialEventStore`, atacando **exclusivamente** as divergências da Sprint 5.0-21A, sem reintroduzir o motor legado e sem alterar a arquitetura do pipeline.

## Resultado da paridade

| Métrica | 5.0-21A (antes) | 5.0-21B (depois) | Meta |
|---------|-----------------|------------------|------|
| `historyParityPercent` | 91.7% | **100%** | 100% |
| `nextInvoiceParityPercent` | 73.3% | **100%** | 100% |
| `capabilitiesParityPercent` | 95.8% | **100%** | 100% |
| `eventsParityPercent` | 90.0% | **92.5%** | 100% |
| `calendarParityPercent` | 45.6% | **94.4%** | ≥99% |
| `sidebarParityPercent` | 63.4% | **93.8%** | ≥99% |
| `alertsParityPercent` | 8.8% | **77.5%** | ≥99% |
| **`overallParityPercent`** | **73.0%** | **95.7%** | ≥99% |
| Divergências totais | 259 | **43** | — |

**Cutover:** ainda `READY_WITH_CORRECTIONS` (não ≥99%). Apto para **5.0-21C Re-Certification** após gaps residuais.

## Correções implementadas (P0 / P1)

### P0 — History (100%)

- Ordenação **dueYmd desc** (paridade `getHistoryRows`)
- Apenas eventos `kind: 'real'` com `cycleId`
- Campo `date` = `dueYmd` (não `processedAt`)

### P0 — NextInvoice (100%)

- Critério **first eligible cycle** (`invoiceId` null + status generatable), ordenado por `cycleDate` asc
- Fallback: **primeira projeção** futura (`isProjected: true`, `cycleId: null`)
- Assinatura cancelada: sem nextInvoice (sem projeção)

### P0 — Capabilities (100%)

- `canGenerate` = `status !== 'cancelled'` e existe ciclo generatable sem invoice
- Status generatable: `pending | queued | failed | skipped | cancelled`
- Alinhado a `cycleSupportsManualGenerate` sem importar o módulo legado

### P1 — Calendar (94.4%)

- Projeções UX via `buildProjectionEventsFromAggregate` (nextBillingDate + occupied cycle dates)
- `isProjected`, `cycleId: null` em projeções
- Contagem total alinhada ao legado na maioria dos cenários

### P1 — Sidebar (93.8%)

- Contrato UI: `nextReceiptDate`, `openAmount`, `lastPaymentDate`
- Labels curtos de data e formatação monetária pt-BR

### P1 — Alerts (77.5%)

- Taxonomia legada: `billing_missing`, `client_overdue`, `gateway_failed`
- Derivados de cycles/events (sem timeline)

## Arquivos alterados

| Arquivo | Mudança |
|---------|---------|
| `financialEventSnapshot.ts` | Emissão alinhada (recoverable failed, cancelled skip, invoice_due) |
| `historySnapshot.ts` | Ordenação desc por dueYmd |
| `nextInvoiceSnapshot.ts` | First eligible + projeção |
| `projectionSnapshot.ts` | **Novo** — projeções UX |
| `calendarSnapshot.ts` | Reais + projeções, `isProjected` |
| `sidebarSnapshot.ts` | Contrato UI legado |
| `alertsSnapshot.ts` | Taxonomia legada |
| `capabilitiesSnapshot.ts` | Generate alinhado |
| `aggregateDateUtils.ts` | **Novo** — datas/formatação isoladas |
| `BillingAggregateBuilder.ts` | Pipeline: NextInvoice antes de Sidebar |
| `shadowCertification.ts` | Checks atualizados para novos contratos |
| `shadowSnapshot.ts` | `nextInvoiceIsProjected`, `projectedCalendarCount` |

## Isolamento preservado

- Zero imports de `FinancialEventStore`, builders legados, `billingStateMachine`, timeline
- Ingress continua só em SubscriptionStage / CycleStage
- Shadow Runtime permanece ativo (flag default off)
- Certification Suite visual (legado) **verde** — UI inalterada

## Divergências residuais (43) — justificativa

| Superfície | # | Causa |
|------------|---|--------|
| alerts | 18 | `gateway_failed` depende de `operational_state` na timeline; `cycles_raw` não carrega esse sinal em todos os fixtures |
| sidebar | 10 | `openAmount` / `lastPaymentDate` — legado pode emitir múltiplos tipos de evento por ciclo (`invoice_generated` + `invoice_due`); Aggregate emite 1 evento/ciclo |
| events / calendar | 6+9 | Mesma causa: legado pode emitir **múltiplos** `FinancialEvent` por ciclo; Aggregate mantém 1:1 ciclo→evento |

Esses gaps exigem ou (a) enriquecer `cycles_raw`/invoices no ingress, ou (b) emitir múltiplos eventos por ciclo no Aggregate — candidatos explícitos para **5.0-21C** se a meta for ≥99%.

## Testes

```bash
npm run test:billing   # 709 passed
```

Inclui Golden Dataset, Certification Suite, Regression 4.2K–4.2Q, Shadow Runtime e Shadow Certification.

## Próxima Sprint (5.0-21C)

**Billing Shadow Re-Certification** — reexecutar o laudo completo e decidir cutover. Se overall ≥99% nas superfícies de UI, autorizar planejamento do cutover; caso contrário, fechar os 43 gaps residuais (multi-event por ciclo + gateway sem timeline).
