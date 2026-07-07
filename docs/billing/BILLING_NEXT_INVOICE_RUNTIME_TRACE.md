# Sprint 5.0-22C — Billing Next Invoice Runtime Trace

**Modo:** INVESTIGATION (READ ONLY)

---

## Pipeline Próxima cobrança

```
aggregate.nextInvoiceStage
  resolveNextInvoiceFromAggregate(subscription, cycles, events+projections, todayYmd)
    ↓
buildNextChargePresentationFromAggregate(aggregate)
    ↓
prebuilt.nextChargePresentation
    ↓
FinancialEventStore._nextChargeCache
    ↓
store.getNextChargePresentation()
    ↓
NextInvoiceCard
  next = store.getNextChargePresentation()
  showAction = active && !next.isProjected && (hasInvoice ? open : cycleId && generate)
```

---

## Comparativo triplo (pergunta 10)

### Path 22B — são iguais Aggregate → Store?

**SIM** — mesma função, mesmo objeto em cache:

```typescript
// buildAggregateStorePrebuilt.ts
const nextChargePresentation = buildNextChargePresentationFromAggregate(aggregate);
// FinancialEventStore ctor
this._nextChargeCache = this.aggregateFacade.nextChargePresentation;
```

| Campo | aggregate.nextInvoice | store.getNextChargePresentation() |
|-------|----------------------|--------------------------------|
| cycleId | `next.cycleId` | `isProjected ? null : next.cycleId` via adapter |
| isProjected | `next.isProjected` | idem |
| dueYmd | `next.date` | idem |
| hasInvoice | `metadata.invoiceId` | idem |

**Não há divergência Store vs Aggregate** no path 22B prebuilt.

### Aggregate/Store vs props do card

| Campo | Store | Card props |
|-------|-------|------------|
| status assinatura | via `detail` no adapter header only | `detail.subscription.status` — **prop React fresh** |
| next presentation | store | store |
| showAction | N/A | **computado no card** — gate extra |

**Divergência UI:** card aplica `!next.isProjected` — Store pode ter `isProjected: true` **corretamente** e card **oculta Gerar** — não é inconsistência Aggregate/Store.

---

## Evidência runtime (snapshots certificados)

### BEFORE — `scheduler-renewal`

```json
"nextInvoice": {
  "cycleId": "c-sched",
  "isProjected": false,
  "dueYmd": "2026-07-14",
  "showGenerate": true
}
```

### AFTER generate-like — `charge-early-generated`

Ciclo gerado com invoice; sem próximo ciclo pending:

```json
"nextInvoice": {
  "cycleId": null,
  "isProjected": true,
  "dueYmd": "2026-09-14",
  "showGenerate": false
}
```

**Observação auditável:** card apontaria **Setembro projected**, não a fatura **Agosto** com invoice — porque `resolveNextInvoiceFromAggregate` prioriza **primeiro ciclo elegível**; se ausente, **primeira projeção futura** (`nextInvoiceSnapshot.ts:48-93`), não “última fatura gerada”.

### AFTER generate-like — `projection-only`

Sem ciclos reais:

```json
"nextInvoice": {
  "cycleId": null,
  "isProjected": true,
  "dueYmd": "2026-08-14",
  "showGenerate": false
}
```

### AFTER restart — novo pending (`scheduler-renewal` pattern)

```json
"nextInvoice": {
  "cycleId": "c-sched",
  "isProjected": false,
  "showGenerate": true
}
```

---

## Card “continua mostrando cobrança anterior”

Cenários com evidência:

| Sintoma | Causa com evidência | Camada |
|---------|---------------------|--------|
| Mostra **Abrir** na fatura recém-gerada | `next.hasInvoice === true` | Store fresh, UX correta |
| Mostra **Prevista** sem Gerar | `isProjected: true`, `cycleId: null` | Aggregate input sem C+1 |
| Mostra dados **antigos** (competência já faturada como pending) | signature igual → Store não rebuild | **Provider stale** |
| Mostra competência errada vs histórico | nextInvoice = projeção, não invoice due | **Aggregate policy**, não stale |

---

## generateCycleIds (pergunta 11)

| Momento | Valor (snapshot) | Store atualizado? |
|---------|------------------|-------------------|
| BEFORE | `["c-sched"]` | baseline |
| AFTER Generate | `[]` | ✅ se rebuild |
| AFTER restart | `["c-…"]` | ✅ |

`store.getUiCapabilities().generateCycleIds` vem de `prebuilt.uiCapabilities` — mesma fonte que history `canGenerateNow`.

---

## resolveNextInvoiceFromAggregate — regras auditáveis

1. `resolveFirstEligibleCycleFromAggregate` — ciclo sem invoice, status generatable.  
2. Se null → `firstProjectedEvent(events, todayYmd)`.  
3. Adapter zera `cycleId` quando `isProjected` (`nextInvoiceAdapter.ts:68`).

**Projeção só é usada quando passo 1 falha** — evidência código, confirmada por snapshot `projection-only`.

---

## POST → NextInvoiceCard trace

```
POST manual-renew ✅
  ↓
GET detail ✅
  ↓
signature change? 
  YES → new Store → next from new aggregate ✅
  NO  → old Store → next STALE ❌
  ↓
NextInvoiceCard render
  showAction gate on isProjected ⚠️ (even when fresh)
```

---

## Mandatory Evidence — NextInvoice

| Estado | sourceSignature | next.cycleId | isProjected | showGenerate | generateCycleIds |
|--------|-----------------|--------------|-------------|--------------|------------------|
| BEFORE | S0 | c-sched | false | true | [c-sched] |
| POST+GET (no C+1) | S1≠S0 | null | true | false | [] |
| POST+GET (signature collision) | S0 | c-sched (stale) | false (stale) | true (stale) | [c-sched] stale |
| Restart+GET | S2 | c-new | false | true | [c-new] |

---

## Ponto exato — Próxima cobrança

1. **Store stale (bug refresh):** `financialEventStoreSignature` unchanged → `_nextChargeCache` antigo.  
2. **Store fresh, card “errado” vs expectativa operador:** payload sem C+1 → `isProjected: true` → gate oculta Gerar — **estado certificado** em `projection-only`.  
3. **Store fresh, card mostra projeção ignorando invoice due:** policy `nextInvoiceStage` — **não** falha de refresh; divergência semântica next vs “última cobrança”.

**Restart corrige (1) só se signature/passou a bater com payload novo; corrige (2) quando scheduler INSERT cycle C+1.**
