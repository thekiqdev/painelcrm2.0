# Sprint 5.0-22C — Billing Calendar Pipeline Audit

**Modo:** INVESTIGATION (READ ONLY)  
**Evidência runtime:** golden snapshots + `captureVisualFixture.ts`

---

## Pipeline completo

```
aggregate.calendarStage
  buildProjectionEventsFromAggregate(subscription, cycles, count=12)
  buildCalendarFromEvents([...events, ...projections])
    ↓
buildCalendarEventsFromAggregate(aggregate, caps)
  aggregate.calendar.map(mapCalendarEntry)   // SEM filter, SEM slice
    ↓
FinancialEventStore(prebuilt)
  _calendarCache = prebuilt.calendarEvents
    ↓
FinancialCalendar
  store.getCalendarEvents()        // lista completa
  store.getEventsForMonth(monthKey)  // filtro mês UI
  store.getEventsByDay()
    ↓
Dots / Popover / MiniCard
  FinancialCalendarPopover: showBillingActions = !projected && cycleId
```

---

## Auditoria obrigatória A–F

### A. Quantas projeções o Aggregate produz?

**Até 12** (`PROJECTION_MAX_COUNT` em `projectionSnapshot.ts`).

Exemplo mensal (`scheduler-renewal`, `todayYmd=2026-06-30`):

| Mês (due) | Tipo |
|-----------|------|
| 2026-07-14 | real (`c-sched`) |
| 2026-08-14 … 2027-07-14 | projected (12 meses) |

**Total `aggregate.calendar`:** 13 eventos (1 real + 12 projected) — snapshot `eventCount: 13`.

Cenário só projeção (`projection-only`): **12** eventos, todos projected.

### B. Quantas chegam ao Store?

**100% do aggregate.calendar** — `buildCalendarEventsFromAggregate` mapeia todos.

Evidência: `captureVisualFixture` — `calendar.eventCount === store.getCalendarEvents().length`.

| Cenário | Store calendar count |
|---------|---------------------|
| scheduler-renewal | 13 |
| projection-only | 12 |
| charge-early-generated | 14 |

### C. Quantas chegam ao React?

`FinancialCalendar`:

```typescript
const calendarEvents = useMemo(() => store.getCalendarEvents(), [store]);
const monthEvents = useMemo(() => store.getEventsForMonth(monthKey), [store, monthKey]);
```

- **Array completo** disponível via `calendarEvents` (passado a filhos).
- **Por mês:** `monthEvents.length` ≤ eventos daquele `YYYY-MM`.

**Não há** perda entre Store e component — só **filtro de visualização mensal**.

### D. Quantas são renderizadas?

| Vista | Quantidade |
|-------|------------|
| Grade do mês atual | dots = dias com eventos em `monthEvents` |
| Popover | 1 evento primário (`pickCalendarPopoverEvent`) |
| Legenda | kinds únicos do mês |

Navegação ◀ ▶ altera `monthKey` — meses futuros **visíveis ao navegar**.

**Default month:** `useState(() => defaultFinancialCalendarMonth(detail, today))` — remonta após skeleton do `load()`.

### E. Filtros take(1) / slice / first?

| Camada | take(1)? |
|--------|----------|
| Aggregate projection loop | Para em `count=12`, não take(1) |
| calendarAdapter | **Não** |
| Store `_calendarCache` | **Não** |
| `getEventsForMonth` | Filter `e.ymd.startsWith(monthKey)` — **não** trunca horizonte global |
| Popover | `pickCalendarPopoverEvent` — **1 evento por dia**, não por calendário inteiro |

**Não existe** `slice(0,1)` no pipeline calendar global.

### F. Onde meses seguintes “desaparecem”?

| Camada | Desaparece? | Evidência |
|--------|-------------|-----------|
| **Aggregate** | Não — 12 projeções | snapshots `projectedCount: 12` |
| **Adapter** | Não | map 1:1 |
| **Store** | Não | `_calendarCache` completo |
| **React** | **Percepção UX:** mês não selecionado; popover **sem Gerar** em projected | `FinancialCalendarPopover` |

**Não é truncamento de dados** — é (1) filtro de mês na grade, (2) ações bloqueadas em projected, (3) possível Store stale se signature não mudou.

---

## Após Generate — calendário atualiza?

| Etapa | Status |
|-------|--------|
| POST | ✅ |
| GET | ✅ |
| Aggregate calendar | ✅ rebuild se signature muda — projeções reancoradas em novo `nextBillingDate` |
| Store calendar | ✅ nova `_calendarCache` |
| React | ✅ `useMemo([store])` recalcula |

**Cenário `charge-early-generated`:** calendar **14** eventos (2 reais + 12 projected) — prova que calendário **recebe** meses futuros após estado pós-geração.

---

## supportsGenerate no calendário

```typescript
// captureVisualFixture.ts
supportsGenerate = cycleCanGenerateFromUiCapabilities(caps, ev.cycleId)
// projected → cycleId null → false
```

Dots projected: visíveis. Gerar no popover: **false** por regra — evidência snapshot `"supportsGenerate": false` em todos projected.

---

## Runtime Trace calendário

```
POST Generate ✅
GET Detail ✅ (payload-dependent)
aggregate.calendar ✅ reconstruído
adapter ✅ sem perda
Store._calendarCache ✅
FinancialCalendar month filter ⚠️ só mês ativo na grade
Popover ⚠️ projected sem ações
Render ✅
```

---

## Definition of Done — calendário

| Critério | Resultado |
|----------|-----------|
| Aggregate produz projeções | ✅ 12 |
| Store recebe todas | ✅ |
| React trunca horizonte global | ❌ não trunca |
| Filtro mês | ✅ sim — UX |
| Primeira camada de “sumiço” percebido | **React popover gate projected** + **visualização mensal** |
