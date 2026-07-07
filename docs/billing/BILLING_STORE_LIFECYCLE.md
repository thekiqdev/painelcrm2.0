# Sprint 5.0-22C — Billing Store Lifecycle

**Modo:** INVESTIGATION (READ ONLY)

---

## Quem é dono do estado?

| Camada | Dono | Mecanismo | Escopo |
|--------|------|-----------|--------|
| Payload assinatura | `SubscriptionDetail` | `useState<CrmSubscriptionDetailPayload>` | Página `/crm-subscriptions/:id` |
| Store financeiro | `FinancialEventStoreProvider` | `useMemo` → `createBillingExperienceStore` | Subárvore financeira |
| Aggregate certificado | Dentro do Store (façade) | `buildBillingAggregateFromDetail` no factory | Snapshot no `prebuilt.aggregate` |
| Calendário mês visível | `FinancialCalendar` | `useState(monthKey)` | Local ao componente |

**Não há** Zustand, singleton global, nem React Query cache para detalhe CRM.

---

## Ciclo de vida após Gerar cobrança

```
[Gerar clique]
     │
     ▼
detail vN (React state) ─────────────────────────────┐
     │                                                  │
     ▼                                                  │
POST manual-renew                                       │
     │                                                  │
     ▼                                                  │
load(): setLoading(true)                                │
     │                                                  │
     ▼                                                  │
<Skeleton /> — FinancialEventStoreProvider DESMONTADO   │
     │                                                  │
     ▼                                                  │
GET /api/crm-subscriptions/:id                          │
     │                                                  │
     ▼                                                  │
setDetail(d vN+1) + setLoading(false) ◄────────────────┘
     │
     ▼
financialEventStoreSignature(d vN+1)
     │
     ├── igual a vN ──► useMemo RETORNA store antigo ❌ (stale)
     │
     └── diferente ──► createBillingExperienceStore(d vN+1)
              │
              ├── buildBillingAggregateFromDetail()  [sem memo]
              ├── buildAggregateStorePrebuilt()
              └── new FinancialEventStore(d, prebuilt)
                     │
                     ├── aggregateFacade = prebuilt completo
                     ├── _calendarCache = prebuilt.calendarEvents
                     ├── _nextChargeCache = prebuilt.nextChargePresentation
                     └── detail = d vN+1 (snapshot construtor)
```

---

## `createBillingExperienceStore()` — executado novamente?

**Resposta:** Somente quando `financialEventStoreSignature(detail)` muda.

```517:523:src/lib/subscriptionFinancialEventStore.ts
export function financialEventStoreSignature(detail: CrmSubscriptionDetailPayload): string {
  const tl = detail.timeline
    .filter((r) => r.merge_source !== 'lifecycle')
    .map((r) => `${r.cycle_id}:${r.invoice_id}:${r.operational_state}:${r.due_date}`)
    .join('|');
  return `${detail.subscription.id}:${detail.subscription.status}:${detail.subscription.next_billing_date}:${detail.latest_invoice_id ?? ''}:${tl}`;
}
```

### Incluído na signature

- `subscription.id`, `status`, `next_billing_date`
- `latest_invoice_id`
- Timeline billing: `cycle_id`, `invoice_id`, `operational_state`, `due_date`

### **Não** incluído na signature (gap teórico)

- Conteúdo bruto de `cycles_raw` (status, metadata, job_id) **se timeline não refletir**
- `invoices[]`, `recent_jobs[]`, `automation_summary`
- Campos de `runtime_validation`

**Mitigação no backend:** `getCrmSubscriptionDetail` monta `timeline` e `cycles_raw` na mesma request a partir dos mesmos rows — inconsistência intra-payload é improvável.

**Risco real:** GET retorna payload **idêntico** à signature anterior (stale read / race) → Store **reutilizado** com `detail` e Aggregate antigos.

---

## `BillingAggregateBuilder` — chamado novamente? Memoização?

**Resposta:** Sim, **uma vez por** `createBillingExperienceStore`, **zero memoização global**.

Pipeline (ordem canônica):

```120:132:src/lib/billingAggregate/BillingAggregateBuilder.ts
export const BILLING_AGGREGATE_PIPELINE_STAGES = [
  subscriptionStage, cycleStage, timelineStage, financialEventStage,
  historyStage, calendarStage, nextInvoiceStage, sidebarStage,
  alertStage, capabilityStage, technicalStage,
];
```

Input de ciclos: **`context.source.cycles_raw`** (não timeline):

```21:25:src/lib/billingAggregate/BillingAggregateBuilder.ts
export const cycleStage = (context, aggregate) => ({
  ...aggregate,
  cycles: mapCyclesFromSource(context.source.cycles_raw, ...),
  invoices: mapInvoicesFromSource(context.source.invoices, ...),
});
```

Cada rebuild recalcula **todas** as stages. Não há `useMemo` no builder.

---

## Caches internos do `FinancialEventStore`

Quando alimentado por **prebuilt** (path Aggregate 22B):

```129:144:src/lib/subscriptionFinancialEventStore.ts
    if (this.aggregateFacade) {
      this._historyCache = this.aggregateFacade.historyRows;
      this._calendarCache = this.aggregateFacade.calendarEvents;
      ...
      this._nextChargeCache = this.aggregateFacade.nextChargePresentation;
    }
```

| Cache privado | Preenchido no ctor (façade)? | Invalidação |
|---------------|------------------------------|-------------|
| `_nextChargeCache` | Sim | Nova instância Store |
| `_calendarCache` | Sim | Nova instância Store |
| `_historyCache` | Sim | Nova instância Store |
| `_byDayCache` | Lazy on first `getEventsByDay()` | Nova instância Store |

**Conclusão:** Store antigo permanece vivo **somente** se Provider `useMemo` não disparar. Não há invalidação parcial dentro da mesma instância no path Aggregate.

---

## `getNextChargePresentation()` stack

```
NextInvoiceCard
  store.getNextChargePresentation()
    if (_nextChargeCache) return cache     ← prebuilt no path 22B
    else resolveNextChargePresentationFromStore(this)  ← legado
```

Path 22B **sempre** hit no cache prebuilt definido no construtor.

---

## Store antigo permanece vivo?

| Condição | Store antigo? |
|----------|---------------|
| Signature muda após GET | **Não** — novo Store |
| Signature igual após GET | **Sim** — mesma referência `store` no context |
| Durante `loading=true` | Provider desmontado — Store GC-eligible |
| Remount após skeleton | Sempre avalia signature de novo |

---

## Audit rápido (perguntas 1–7 do mandatory)

1. **Dono estado assinatura:** `SubscriptionDetail` (`useState detail`)
2. **Quem deveria reconstruir Aggregate:** `createBillingExperienceStore` no Provider
3. **Quem realmente reconstrói:** Idem, **se** signature mudar
4. **Quem deveria invalidar cache:** `load()` / owner do detail (não há query cache)
5. **Quem realmente invalida:** `setDetail` substitui payload; Provider keyed por signature
6. **Quem deveria recriar Store:** Provider `useMemo`
7. **Quem realmente recria:** Provider `useMemo` condicional
