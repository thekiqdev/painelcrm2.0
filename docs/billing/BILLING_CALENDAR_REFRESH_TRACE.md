# Sprint 5.0-22C — Billing Calendar Refresh Trace

**Modo:** INVESTIGATION (READ ONLY)

---

## Pipeline calendário (Aggregate → UI)

```
buildBillingAggregateFromDetail(detail)
  calendarStage
    buildProjectionEventsFromAggregate(subscription, cycles)  [até 12]
    buildCalendarFromEvents([...events, ...projections])
      ↓
buildAggregateStorePrebuilt
  buildCalendarEventsFromAggregate(aggregate, uiCapabilities)
    aggregate.calendar.map(mapCalendarEntry)   [sem filtrar projeções]
      ↓
FinancialEventStore(prebuilt)
  _calendarCache = prebuilt.calendarEvents
      ↓
FinancialCalendar
  store.getCalendarEvents()
  store.getEventsForMonth(monthKey)
  store.getEventsByDay()
      ↓
FinancialCalendarPopover / MiniCard / Tooltip
```

---

## Perguntas específicas calendário

### 1. `aggregate.calendar` produz somente 1 projeção ou vários meses?

**Vários meses — até 12 projeções UX.**

```8:8:src/lib/billingAggregate/projectionSnapshot.ts
export const PROJECTION_MAX_COUNT = 12;
```

```47:56:src/lib/billingAggregate/BillingAggregateBuilder.ts
export const calendarStage = (_context, aggregate) => {
  const projections = buildProjectionEventsFromAggregate(
    aggregate.subscription,
    aggregate.cycles
  );
  return {
    ...aggregate,
    calendar: buildCalendarFromEvents([...aggregate.events, ...projections]),
  };
};
```

Projeções excluem datas já ocupadas por `cycles[].cycleDate`.

### 2. `billingViewAdapter` descarta projeções?

**Não descarta** no calendário adapter.

`buildStoreEventsFromAggregate` separa:
- `realEvents` ← `aggregate.events`
- `projected` ← `aggregate.calendar.filter(isProjected)` mapeados para `FinancialEvent`

`buildCalendarEventsFromAggregate` mapeia **todo** `aggregate.calendar` sem filter.

### 3. `FinancialCalendar` limita quantidade?

**Limita visualização ao mês selecionado**, não ao horizonte total.

```59:61:src/components/subscriptions/financial/FinancialCalendar.tsx
  const monthEvents = useMemo(() => store.getEventsForMonth(monthKey), [store, monthKey]);
  const calendarEvents = useMemo(() => store.getCalendarEvents(), [store]);
```

- `getCalendarEvents()` — lista completa (reais + projetados)
- `getEventsForMonth(monthKey)` — filtro por prefixo `YYYY-MM`
- Navegação mês: chevrons alteram `monthKey`

**Não há** cap de 1 mês no Store; cap de **12 projeções** na origem Aggregate.

### 4. Store remove projeções?

**Não.** Path 22B preenche `_calendarCache` com todos os `calendarEvents` do prebuilt.

Legacy path (rollback flag) reconstruiria via `this.events` incluindo merge de projeções — também até 12.

### 5. Existe limite de horizonte?

| Limite | Valor | Onde |
|--------|-------|------|
| Projeções UX | 12 competências | `PROJECTION_MAX_COUNT` |
| Ciclos DB lidos | 120 | `listSubscriptionCyclesBySubscriptionId(..., 120)` backend |
| Calendário UI | Mês a mês | `monthKey` state |

### 6. Após restart o calendário continua igual ou muda?

| Restart | Efeito calendário |
|---------|-------------------|
| **Frontend only** | Mesmo GET path; calendário **igual** se payload igual |
| **Backend** | Scheduler pode criar ciclo real C+1 → menos projeções puras, mais eventos `kind: real` com `cycleId` → dots com ações Gerar |
| **Tempo** (sem restart) | Próximo tick scheduler → mesmo efeito backend |

---

## Por que “meses futuros sem Gerar” após Gerar?

Três camadas independentes:

| Camada | Comportamento pós-Gerar |
|--------|-------------------------|
| **Aggregate calendar** | Mostra projeções futuras (previstas) ✔ |
| **FinancialCalendarPopover** | `showBillingActions = !projected` — **sem Gerar** em projected |
| **22B uiCapabilities** | `generateCycleIds` só ciclos reais elegíveis |

```35:38:src/components/subscriptions/financial/FinancialCalendarPopover.tsx
  const projected = isProjectedFinancialEvent(ev);
  const showBillingActions = !projected && (hasCycleId || Boolean(ev.invoiceId));
```

Dots **previstos** mostram `ProjectedCompetenceNotice`, não botão Gerar — **desde Sprint 4.2H**, reforçado no wiring 22B.

Quando backend ainda não materializou C+1 em `subscription_cycles`:
- Calendário **mostra** meses futuros como **Prevista** (projeção)
- Gerar **não aparece** (correto por regra de produto)

Quando C+1 existe com status pending:
- Evento vira **real** com `cycleId`
- Popover pode mostrar Gerar se `cycleId ∈ generateCycleIds`

---

## Refresh do calendário após `load()`

| Passo | Calendário atualizado? |
|-------|----------------------|
| GET novo payload | ✔ se signature muda → novo store |
| `store` ref muda | ✔ `useMemo([store])` recalcula |
| `monthKey` | Reset se skeleton desmontou calendário |
| Dots no mês M | ✔ refletem `getEventsForMonth(M)` do store novo |

**Não atualizado** se:
- Signature igual → store antigo → calendário stale
- Usuário não navega ao mês das novas projeções (dados existem no store)

---

## Diagrama calendário pós-Gerar

```
cycles_raw: [C invoiced]  (C+1 ausente)
subscription.next_billing_date: C+1 date
        │
        ▼
Aggregate projections: C+1, C+2, … C+12  (kind: projected, cycleId: null)
        │
        ▼
aggregate.calendar: eventos reais C + projeções
        │
        ▼
FinancialCalendar: dots "Prevista" nos meses futuros
        │
        ▼
Popover: ProjectedCompetenceNotice — SEM Gerar  ❌ (UX esperada 22B)
        │
        ▼
[Scheduler cria cycle C+1 pending]
        │
        ▼
GET seguinte: cycle C+1 real
        │
        ▼
Popover: InvoiceDirectActions + Gerar  ✔
```

---

## Mandatory audit calendário

| # | Pergunta | Resposta |
|---|----------|----------|
| 1 | Projeções no aggregate | Até **12 meses** |
| 2 | Adapter descarta? | **Não** |
| 3 | FinancialCalendar limita? | Por **mês visível**, não horizonte store |
| 4 | Store remove projeções? | **Não** |
| 5 | Limite horizonte | **12** projeções |
| 6 | Restart muda calendário? | **Backend restart / scheduler** sim; frontend-only reload **não** (mesmo payload) |

---

## Ponto de inconsistência calendário (audit 15)

**Primeiro ponto UX “errado” no calendário:** popover trata competências **projected** como não acionáveis — alinhado a regra de negócio, não a falha de refresh.

**Primeiro ponto dados incompletos:** ausência de `subscription_cycles` row para C+1 no payload GET — calendário mostra projeções sem `cycleId` até scheduler materializar ciclo.
