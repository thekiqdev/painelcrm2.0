# Sprint 5.0-22C — Billing Provider Lifecycle

**Modo:** INVESTIGATION (READ ONLY)

---

## FinancialEventStoreProvider

Arquivo: `src/components/subscriptions/financial/FinancialEventStoreContext.tsx`

### Construção

```typescript
const signature = financialEventStoreSignature(detail);
const todayYmd = financialTodayYmd(timeZone);

const value = useMemo(
  () => ({
    store: createBillingExperienceStore(detail, todayYmd),
    timeZone,
    onPaymentConfirmed,
  }),
  [signature, timeZone, onPaymentConfirmed, todayYmd]
);
```

### Matriz de lifecycle

| Fase | Provider montado? | Context `store` ref | `detail` no Store ctor |
|------|-------------------|---------------------|------------------------|
| Loading skeleton (`load()`) | **Não** — `SubscriptionDetail` return early | — | — |
| Idle | Sim | Estável se signature estável | Snapshot no ctor |
| pós-Generate success + load | Remonta após skeleton | Nova ref se signature ≠ | Novo payload |
| pós-Generate + signature igual | Remonta | **Mesma ref** ❌ | **Antigo** ❌ |

### Investigados — ausentes

| Mecanismo | Presente? |
|-----------|-----------|
| `React.memo` no Provider | Não |
| `key={signature}` no Provider | Não |
| Singleton module-level | Não |
| `useRef` cache de store | Não |
| Zustand | Não |
| Context selector | Não — consumers re-render com value |

### Onde instância permanece viva

**Único ponto:** `useMemo` retorna mesma `{ store, ... }` quando deps inalteradas.

Dependências **não** incluem `detail` object identity — apenas `signature` derivada.

---

## Fluxo Provider após Generate

```
handleGenerateBilling success
  setGeneratingBilling(false)
  await load()
    setLoading(true)  → SubscriptionDetail skeleton
      FinancialEventStoreProvider UNMOUNT
    GET detail
    setDetail(d_new)
    setLoading(false)
      FinancialEventStoreProvider MOUNT
        signature_new = financialEventStoreSignature(d_new)
        useMemo compare signature_prev vs signature_new
          if changed → createBillingExperienceStore(d_new)
          else → return cached value (STORE STALE)
```

---

## onPaymentConfirmed

`onPaymentConfirmed={load}` — mesma função `load` estável (`useCallback` deps `[id, navigate]`). Não provoca rebuild extra por si; rebuild só após `setDetail`.

---

## Provider vs React `detail` prop

Componentes recebem **dois canais**:

| Canal | Fonte | Fresh após load? |
|-------|-------|------------------|
| `detail` prop | `SubscriptionDetail` state | **Sempre** |
| `store.*` | Provider context | **Só se Store recriado** |

**Divergência possível:** `NextInvoiceCard` usa `detail.subscription.status` (fresh) + `store.getNextChargePresentation()` (stale se signature collision).

---

## F5 vs restart frontend

| Ação | Provider lifecycle |
|------|-------------------|
| F5 | Full remount; `useEffect` → `load()`; novo Provider |
| Vite HMR parcial | Pode preservar state em dev — **não** reproduz bug em prod build |
| Restart `start.bat` | Igual F5 |

**Sem diferença arquitetural** entre F5 e restart frontend para Provider.

---

## Navegação entre assinaturas

`/crm-subscriptions/:id` — `id` muda → `load` recria → `detail` substituído → Provider remount com novo subscription id → signature diferente → **novo Store**.

Equivalente a “hard refresh” da experiência financeira daquela assinatura.

---

## Audit Provider (perguntas 6, 11, 13, 14)

6. **Reconstruído?** Sim se signature mudar; não se colisão.  
11. **Referência antiga?** Sim — via `useMemo` hit.  
13. **F5 vs restart FE:** sem diferença.  
14. **Outra assinatura vs restart:** navegação limpa state local; restart backend altera payload GET subsequente.
