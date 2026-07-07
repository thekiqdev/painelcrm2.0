# Sprint 5.0-22C — Billing Store Refresh Matrix

**Modo:** INVESTIGATION (READ ONLY)

---

## FinancialEventStore — recriado ou reutilizado?

### Constructor (path 22B aggregate)

```typescript
// subscriptionFinancialEventStore.ts:121-149
constructor(detail, todayYmd, prebuilt) {
  this.aggregateFacade = prebuilt; // full façade
  this.realEvents = prebuilt.realEvents;
  this.events = prebuilt.events;
  this._historyCache = prebuilt.historyRows;
  this._calendarCache = prebuilt.calendarEvents;
  this._nextChargeCache = prebuilt.nextChargePresentation;
  // ...
}
```

| Ponteiro | Origem pós-rebuild |
|----------|-------------------|
| `aggregateFacade.aggregate` | Novo `buildBillingAggregateFromDetail` |
| `events` | `buildStoreEventsFromAggregate` |
| `_calendarCache` | `buildCalendarEventsFromAggregate` |
| `_nextChargeCache` | `buildNextChargePresentationFromAggregate` |
| `detail` | Payload do momento do ctor |

### getNextChargePresentation

```typescript
if (this._nextChargeCache) return this._nextChargeCache;
// legado: resolveNextChargePresentationFromStore — NÃO roda no path 22B prebuilt
```

**22B:** Store next === prebuilt next === derivado de `aggregate.nextInvoice` no momento do rebuild.

---

## Matriz refresh pós-Generate

| Condição | Store recriado? | Aggregate interno | generateCycleIds |
|----------|-----------------|-------------------|------------------|
| GET novo + signature nova | ✅ | ✅ | ✅ reflete payload |
| GET novo + signature igual | ❌ | ❌ stale | ❌ stale |
| POST fail + load | ✅ se signature mudou | ✅ | ✅ |
| POST success + catch (no load) | ❌ | ❌ | ❌ |
| onPaymentConfirmed | ✅ após load | ✅ | ✅ |

---

## Caches internos (invalidação)

| Cache | Invalidado como |
|-------|-----------------|
| `_calendarCache` | Nova instância Store |
| `_nextChargeCache` | Nova instância Store |
| `_historyCache` | Nova instância Store |
| `_byDayCache` | Lazy; nova instância |
| `_kpiCache`, `_sidebarCache`, etc. | Nova instância |

**Não há** `store.invalidate()` — único mecanismo = novo Store via Provider.

---

## buildAggregateStorePrebuilt — memoização

**Nenhuma.** Função pura:

```typescript
export function buildAggregateStorePrebuilt(aggregate, detail) {
  const uiCapabilities = buildUiCapabilitiesFromAggregate(aggregate);
  const { realEvents, events } = buildStoreEventsFromAggregate(aggregate, detail);
  const calendarEvents = buildCalendarEventsFromAggregate(aggregate, uiCapabilities);
  const nextChargePresentation = buildNextChargePresentationFromAggregate(aggregate);
  // ...
}
```

Dependências implícitas: todo o `aggregate` + `detail.client_name` (header).

---

## billingViewAdapter

| Função | Filtro / slice | Memo |
|--------|----------------|------|
| `buildStoreEventsFromAggregate` | `aggregate.calendar.filter(isProjected)` para projected events | Não |
| `mergeRealAndProjectionEvents` | merge sort | Não |

---

## uiCapabilities / generateCycleIds

```typescript
// uiCapabilitiesAdapter.ts
generateCycleIds = cycles
  .filter(c => !c.invoiceId && GENERATABLE_CYCLE_STATUSES.has(c.status))
  .map(c => c.id);
```

| Snapshot | generateCycleIds |
|----------|------------------|
| BEFORE `scheduler-renewal` | `["c-sched"]` |
| AFTER `charge-early-generated` | `[]` |
| AFTER `projection-only` | `[]` |
| AFTER restart (pending C+1) | `["c-novo"]` |

**Atualizado após Generate?** Sim **se** Store rebuild. Valor **`[]`** é atualização correta quando payload não tem ciclo elegível — não é cache stale.

---

## Colisão de signature (evidência gap)

Campos **fora** da signature:

- `cycles_raw[].status`, `job_id`, `metadata`
- `invoices[]` detalhes
- `recent_jobs[]`
- `runtime_validation`

Se backend mutar só estes campos, **Store hash permanece** → Aggregate antigo embutido.

**Evidência parcial:** teste 4.2Q prova sensibilidade a timeline; **não** há teste para mutação só `cycles_raw`.

---

## Mandatory Evidence table

| Métrica | BEFORE | AFTER gen (no next cycle) | AFTER restart |
|---------|--------|---------------------------|---------------|
| Payload hash (conceptual) | baseline | Δ invoice, Δ next_billing | Δ +cycle row |
| sourceSignature | S0 | S1 ≠ S0 | S2 ≠ S1 |
| Store instance | Store₀ | Store₁ novo | Store₂ novo |
| calendar event count | 13 | 12–14 | 13+ |
| history rows | 1 | 1–2 | 2+ |
| generateCycleIds | non-empty | `[]` | non-empty |

Fonte contadores: `tests/billing/snapshots/*.json`.

---

## Ponto exato Store-level

1. **Store stale:** signature collision após GET.  
2. **Store fresh, dados “errados”:** payload GET sem C+1 — Store reflete Aggregate certificado, não bug de refresh.  
3. **Store fresh, UI esconde ações:** gates React downstream do Store.
