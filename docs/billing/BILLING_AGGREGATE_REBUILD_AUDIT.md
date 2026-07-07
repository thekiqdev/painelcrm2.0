# Sprint 5.0-22C — Billing Aggregate Rebuild Audit

**Modo:** INVESTIGATION (READ ONLY)

---

## BillingAggregateBuilder — reconstrução

### Quando roda?

```typescript
// createBillingExperienceStore.ts (path aggregate default)
const aggregate = buildBillingAggregateFromDetail(detail, today);
// → runBillingAggregatePipeline(context, emptyAggregate)
```

| Evento | Chamadas ao pipeline |
|--------|---------------------|
| Mount inicial SubscriptionDetail | 1 |
| `load()` + signature mudou | 1 |
| `load()` + signature igual | **0** (Store antigo mantém aggregate embutido) |
| Re-render React sem signature change | 0 |

### Stages (ordem fixa)

1. subscriptionStage  
2. cycleStage ← **`cycles_raw`**  
3. timelineStage (no-op)  
4. financialEventStage  
5. historyStage  
6. calendarStage ← projeções `PROJECTION_MAX_COUNT=12`  
7. nextInvoiceStage  
8. sidebarStage  
9. alertStage  
10. capabilityStage  
11. technicalStage  

### sourceSignature

```typescript
// BillingAggregate.ts createEmptyBillingAggregate
sourceSignature: billingContextSourceSignature(context.source)
// === financialEventStoreSignature(detail)
```

Teste: `tests/billing/aggregate/aggregateHarness.test.ts` — `aggregate.sourceSignature === financialEventStoreSignature(detail)`.

### billingAggregateSignature (hash metadados)

```typescript
// BillingAggregate.ts:88-98
[subscriptionId, todayYmd, sourceSignature, cycles.length, events.length,
 history.length, calendar.length, alerts.length].join(':')
```

**Não** inclui conteúdo de `nextInvoice.cycleId` — dois aggregates com mesmos contadores podem colidir; usar `sourceSignature` + inspeção de `nextInvoice` para audit fino.

---

## Comparação Aggregate: pós-Generate imediato vs pós-restart

Evidência: snapshots golden certificados (runtime harness `captureBillingVisualFixture`).

### Cenário A — antes de gerar (`scheduler-renewal`)

```json
"nextInvoice": { "cycleId": "c-sched", "isProjected": false, "showGenerate": true }
"generateCycleIds": ["c-sched"]
"calendar": { "eventCount": 13, "projectedCount": 12 }
```

### Cenário B — após gerar sem próximo ciclo DB (`projection-only` / `charge-early-generated`)

```json
"nextInvoice": { "cycleId": null, "isProjected": true, "showGenerate": false }
"generateCycleIds": []
"calendar": { "eventCount": 12-14, "projectedCount": 12 }
```

### Cenário C — após restart/scheduler (`scheduler-renewal` ou novo pending)

Igual cenário A com **novo** `cycleId` na próxima competência.

### Campos que mudam (A → B)

| Superfície | Mudança |
|------------|---------|
| `aggregate.events` | +eventos invoice_generated / invoice_due |
| `aggregate.calendar` | +dots reais; projeções reancoradas em novo `nextBillingDate` |
| `aggregate.nextInvoice` | `cycleId` real → `null`; `isProjected` false → true |
| `aggregate.history` | rows com invoice; `canGenerateNow` false |
| `aggregate.sidebar` | `openAmount` pode subir |
| `aggregate.capabilities.generateCycleIds` | `["c-sched"]` → `[]` |
| `aggregate.alerts` | pode ativar overdue |

### Campos que mudam (B → C)

| Superfície | Mudança |
|------------|---------|
| `aggregate.nextInvoice` | projected → real com `cycleId` |
| `aggregate.capabilities` | `generateCycleIds` repovoado |
| `aggregate.calendar` | dot real C+1 com `cycleId`, `supportsGenerate: true` |

**Conclusão com evidência:** Aggregate **é reconstruído** após Generate; o produto **não é igual** ao pós-restart porque **input `cycles_raw` difere** (ciclo C+1 ausente vs presente).

---

## Memoização

| Função | Memo? |
|--------|-------|
| `buildBillingAggregateFromDetail` | Não |
| `runBillingAggregatePipeline` | Não |
| `buildAggregateStorePrebuilt` | Não |
| `buildStoreEventsFromAggregate` | Não |
| Stage functions | Não |

Única memoização upstream: Provider `useMemo` keyed por signature.

---

## Backend → Aggregate input gap (evidência código)

| Passo backend pós-manual-generate | Atualiza `cycles_raw` C+1? |
|-----------------------------------|----------------------------|
| `subscriptionCyclesOnJobCompleted` | Marca C invoiced |
| `advanceSubscriptionAfterCompletedCycle` | Avança `next_billing_date` |
| `tryEnqueueRenewalJobForSubscriptionId` | **Não chamado** no fim de `manualGenerateRenewalNow` |
| `subscriptionCyclesUpsertAfterScheduler` | Só via scheduler / patch next-billing |

**Corolário auditável:** GET imediato pode ter `next_billing_date` novo **sem** row C+1 → Aggregate `resolveNextInvoiceFromAggregate` cai em projeção (`nextInvoiceSnapshot.ts:72-93`).

---

## Testes de regressão executados

```
npx vitest run tests/billing/wiring/billingUiWiring.test.ts
npx vitest run tests/billing/regressions/audit-4.2Q-aggregate.test.ts
→ 7/7 passed (2026-07-04)
```
