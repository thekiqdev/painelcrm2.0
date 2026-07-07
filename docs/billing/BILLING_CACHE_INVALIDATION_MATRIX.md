# Sprint 5.0-22C — Billing Cache Invalidation Matrix

**Modo:** INVESTIGATION (READ ONLY)

---

## Resposta direta: React Query / SWR / TanStack

**Subscription detail CRM não usa nenhuma biblioteca de cache de servidor.**

| Tecnologia | Usado em SubscriptionDetail? | invalidate/refetch billing? |
|------------|------------------------------|----------------------------|
| TanStack React Query | **Não** | — |
| SWR | **Não** | — |
| `useQuery` / `queryClient` | **Não** | — |
| `useState` + `load()` manual | **Sim** | Único mecanismo |

Grep em `src/pages/SubscriptionDetail.tsx`, `src/services/crmSubscriptions.ts`, `src/components/subscriptions/**`: zero `invalidateQueries`, zero `useQuery`.

React Query existe no projeto (`src/lib/queryClient.ts`) com defaults:

```21:23:src/lib/queryClient.ts
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
```

Isso **não afeta** billing subscription detail.

---

## Matriz completa de invalidação pós-`executeDeterministicGenerateRenewal`

| Etapa | Ação | Invalidação? | Detalhe |
|-------|------|--------------|---------|
| POST `manual-renew` | Persiste backend | N/A frontend | Response parcial, não atualiza UI |
| Success branch | `await load()` | **Refetch explícito** | GET fresco |
| Error branch | `await load()` | **Refetch explícito** | GET fresco |
| Catch branch | toast only | **Sem refetch** | Gap menor |
| React Query | — | **Não aplicável** | — |
| `apiClient` GET cache | fetch nativo | **Sem cache app** | Cada GET rede |
| Provider signature | compare string | **Invalidação lógica** | Se string mudar |
| Store private caches | ctor prebuilt | **Substituídos** com nova instância | |
| FinancialCalendar `monthKey` | useState | Reset no remount (skeleton) | |

---

## Fluxo esperado vs observado

### Fluxo implementado (código)

```
Generate
  ↓
POST /api/crm-subscriptions/:id/manual-renew
  ↓
200 + CrmSubscriptionManualRenewalResult
  ↓
await load()                    ← NÃO invalidateQueries; load manual
  ↓
GET /api/crm-subscriptions/:id
  ↓
setDetail(payload)
  ↓
financialEventStoreSignature(payload)
  ↓
useMemo → createBillingExperienceStore (se signature ≠)
  ↓
Render
```

**Não existe** ramo “fecha modal → nenhum refetch” no fluxo de sucesso.

---

## Event bus / eventos customizados

| Evento | Dispara refresh assinatura? |
|--------|----------------------------|
| `window.dispatchEvent` billing | **Não encontrado** |
| `onPaymentConfirmed` → `load` | **Sim** — pagamento de fatura na UI |
| Realtime client | Não wired para CRM subscription detail |
| `[BILLING_JOB_TRACE][frontend]` | Log dev only |

**Após Gerar:** nenhum event bus deveria disparar refresh além do `await load()` já presente.

---

## Cache por camada

| Camada | Tipo | Invalidado após Gerar? |
|--------|------|------------------------|
| HTTP | None (app-level) | GET novo a cada load |
| React `detail` state | Mutable state | `setDetail` ✔ |
| Context signature | Derived string | Recalc ✔ |
| FinancialEventStore | Instance + field caches | Nova instance se signature ✔ |
| BillingAggregate | Embedded in prebuilt | Rebuild com Store ✔ |
| `FinancialCalendar` month | Local state | Remount on skeleton ✔ |
| Browser bfcache | Browser | Full page reload pode restaurar; F5 refetch via useEffect |

---

## refresh manual vs automático

| Ação | Comportamento |
|------|---------------|
| Gerar → auto `load()` | GET + skeleton flash + rebuild condicional |
| F5 / navegar away/back | `useEffect([load])` → GET inicial |
| Restart frontend (Vite) | Igual F5 — sem cache billing persistente |
| Restart backend | GET igual; **plus** scheduler pode criar ciclo C+1 |
| `onPaymentConfirmed` | Mesmo `load()` |

**Diferença material:** restart **backend** ≠ reload frontend. Backend restart executa scheduler/worker que frontend reload **não** executa.

---

## Quem deveria vs quem invalida (audit 4–5)

4. **Quem deveria invalidar cache?** — Dono do detail (`load`) ou, se houvesse RQ, mutation onSuccess invalidate.  
5. **Quem realmente invalida?** — `handleGenerateBilling` → `load()` apenas. Sem RQ.

---

## Race condition após Generate (audit 14)

| Race | Sintoma | Mitigação existente |
|------|---------|---------------------|
| GET before DB commit | Payload old; signature igual; **Store stale** | Nenhuma (no retry/delay) |
| GET after commit, before scheduler | Payload fresh; **projected next** | Nenhuma no frontend |
| Double load | Last write wins | Aceitável |

---

## Lista de todas as chamadas invalidate/refetch no ecossistema (billing CRM)

**Únicas relacionadas a subscription financial:**

1. `SubscriptionDetail.load()` — GET manual (mount + pós-ações + pós-Gerar)
2. `onPaymentConfirmed={load}` — após confirmar pagamento em invoice actions

**Não relacionadas (outros módulos com TanStack Query):** Leads, Chat, Clients, Tasks, Settings, etc. — fora do escopo CRM subscription detail.

---

## Conclusão

A investigação **não** encontrou falha de `invalidateQueries` — a camada **nunca existiu** para este recurso. O refresh pós-Gerar depende de:

1. `await load()` (presente ✔)
2. Payload GET refletir estado backend real
3. `financialEventStoreSignature` capturar diferença billing-relevante

Ausência de (2) ou colisão em (3) explica stale state **sem** bug de React Query.
