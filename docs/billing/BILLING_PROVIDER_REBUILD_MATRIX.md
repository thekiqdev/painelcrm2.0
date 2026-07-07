# Sprint 5.0-22C — Billing Provider Rebuild Matrix

**Modo:** INVESTIGATION (READ ONLY)

---

## FinancialEventStoreProvider — matriz de rebuild

| Gatilho | Dispara rebuild Store? | Mecanismo | Evidência |
|---------|------------------------|-----------|-----------|
| `detail` muda (qualquer campo) | **Condicional** | Só se `financialEventStoreSignature(detail)` mudar | `FinancialEventStoreContext.tsx:30-40` |
| `next_billing_date` muda | **Sim** | Parte da signature | `subscriptionFinancialEventStore.ts:522` |
| Nova fatura em timeline | **Sim** | `invoice_id` / `operational_state` na signature | idem |
| `cycles_raw` novo ciclo aparece | **Sim** (via timeline) | Novo `cycle_id` na string timeline | backend `buildSubscriptionTimeline` |
| `cycles_raw` muda sem timeline | **Não** | Gap teórico | ver BILLING_STORE_LIFECYCLE |
| `onPaymentConfirmed` referência muda | **Sim** | Dep explícita no useMemo | Provider deps |
| `timeZone` muda | **Sim** | Dep explícita | Provider deps |
| `todayYmd` muda (virada dia TZ) | **Sim** | Dep explícita | Provider deps |
| Gerar cobrança (sucesso) | **Sim** (típico) | `load()` → payload com invoice | SubscriptionDetail:194 |
| Gerar cobrança (erro API) | **Sim** | `load()` também no branch error | SubscriptionDetail:197 |
| Gerar cobrança (throw client) | **Não** | catch não chama `load()` | SubscriptionDetail:199-201 |
| Pagamento confirmado (invoice UI) | **Sim** | `onPaymentConfirmed={load}` | SubscriptionDetail:495 |

---

## useMemo / useCallback / memo — inventário billing UI

### Provider (crítico)

```33:41:src/components/subscriptions/financial/FinancialEventStoreContext.tsx
  const value = useMemo(
    () => ({
      store: createBillingExperienceStore(detail, todayYmd),
      timeZone,
      onPaymentConfirmed,
    }),
    [signature, timeZone, onPaymentConfirmed, todayYmd]
  );
```

- **`detail` omitido das deps intencionalmente** — substituído por `signature`.
- Comentário eslint: *"signature captures timeline mutations"*.

### SubscriptionDetail

| Hook | Bloqueia rebuild? |
|------|-------------------|
| `useCallback(load)` | Não — dispara fetch |
| `useCallback(handleGenerateBilling)` | Não |
| `useState(detail)` | Fonte de verdade — atualiza Provider |

### FinancialCalendar

| Hook | Comportamento pós-refresh |
|------|-------------------------|
| `useState(monthKey)` | **Reset** quando Provider desmonta (skeleton durante load) |
| `useMemo(..., [store, monthKey])` | Recalcula quando **referência store** muda |
| `useMemo(..., [store])` | `getCalendarEvents()` segue Store novo |

### NextInvoiceCard

- Sem `memo` / `useMemo`.
- Lê `store.getNextChargePresentation()` a cada render.
- **Não** bloqueia rebuild.

### Componentes memoizados (grep billing path)

Nenhum `React.memo` nos componentes financeiros principais (`NextInvoiceCard`, `FinancialCalendar`, `FinancialSummarySidebar`) que isole render com store antigo.

---

## Singleton / cache global

| Mecanismo | Presente no path billing detail? |
|-----------|----------------------------------|
| TanStack Query | **Não** |
| SWR | **Não** |
| Zustand billing store | **Não** |
| `apiClient` response cache | **Não** |
| Module-level Store singleton | **Não** |
| Shadow mode side effect | `runBillingShadowSideEffect` — diagnóstico only, não alimenta UI |

---

## FinancialEventStoreProvider — recria ou mantém?

| Evento | Provider instance | Context `value.store` |
|--------|-------------------|----------------------|
| Render normal mesmo detail | Mesma árvore Provider | Mesma ref se signature igual |
| `load()` inicia | **Desmonta** (skeleton) | — |
| `load()` completa, signature nova | Remonta | **Nova** ref |
| `load()` completa, signature igual | Remonta | **Mesma** ref (stale) |

---

## Provider mantém referência antiga?

**Sim, quando:** `financialEventStoreSignature(before) === financialEventStoreSignature(after)`.

Causas:

1. GET retornou payload billing-equivalente (race / stale).
2. Mudança em campos **fora** da signature (`runtime_validation`, jobs) — Store ignora.

**Não, quando:** invoice gerada altera timeline ou `latest_invoice_id` ou `next_billing_date`.

---

## Stack completa de rebuild (happy path)

```
handleGenerateBilling
  executeDeterministicGenerateRenewal
    crmSubscriptionsService.generateRenewalNow  [POST]
  await load()
    crmSubscriptionsService.getById             [GET]
    setDetail(newPayload)
SubscriptionDetail render
  FinancialEventStoreProvider({ detail: newPayload })
    financialEventStoreSignature(newPayload) → signature'
    useMemo fired (signature' ≠ signature)
      createBillingExperienceStore(newPayload, todayYmd)
        buildBillingAggregateFromDetail(newPayload, todayYmd)
          runBillingAggregatePipeline × 11 stages
        buildAggregateStorePrebuilt(aggregate, newPayload)
        new FinancialEventStore(newPayload, prebuilt)
    Context.Provider value={{ store: newStore, ... }}
NextInvoiceCard / FinancialCalendar render
  useFinancialEventStore() → newStore
```

---

## Matriz: quem deveria vs quem faz

| Responsabilidade | Deveria | Real |
|------------------|---------|------|
| Refetch pós-Gerar | Page owner | `load()` ✔ |
| Invalidar query cache | N/A (sem RQ) | — |
| Detectar mudança billing | Signature ou detail deep | Signature ✔ (parcial) |
| Rebuild Aggregate | Factory on rebuild | ✔ condicional |
| Propagar ao calendário | Nova ref store | ✔ condicional |

---

## Perguntas 8–11 (Mandatory Audit)

8. **Payload novo ignorado?** — Ignorado pelo Store **se** signature idêntica; React `detail` state atualiza sempre.
9. **Aggregate novo ignorado?** — Mesma condição que Store (embute no prebuilt).
10. **Store antigo vivo?** — Possível se signature collision.
11. **Provider referência antiga?** — Possível via useMemo + signature igual.
