# Sprint 5.0-22C — Billing Runtime Refresh Flow

**Modo:** INVESTIGATION (READ ONLY)  
**Data:** 2026-07-04  
**Objetivo:** Localizar onde o estado deixa de refletir a cobrança recém-gerada sem reiniciar frontend/backend.

---

## Resumo executivo

| Pergunta | Resposta | Evidência |
|----------|----------|-----------|
| GET após Gerar? | **SIM** | `SubscriptionDetail.handleGenerateBilling` → `await load()` → `crmSubscriptionsService.getById` |
| React Query / invalidate? | **NÃO** | Detalhe da assinatura usa `useState` local; zero `invalidateQueries` no módulo CRM |
| Store recriado após GET? | **Condicional** | Só se `financialEventStoreSignature(detail)` mudar |
| Aggregate recalculado? | **Condicional** | Só quando `createBillingExperienceStore` roda de novo |
| Calendário recebe projeções novas? | **Condicional** | Mesma condição; adapter não descarta projeções (até 12 meses) |
| Primeiro ponto de inconsistência percebida | **Interpretação Aggregate + gap backend de ciclo** | Ver seção “Ponto de ruptura” |

**Veredicto:** O pipeline de refresh **existe e executa** após Gerar. Na maioria dos casos reportados, a UI **reconstrói** Store/Aggregate, mas exibe **próxima competência projetada** (`isProjected=true`) porque o payload pós-GET ainda **não contém** o próximo `subscription_cycles` elegível — comportamento correto do Aggregate 5.0-22B. O “fix” após reiniciar o **backend** correlaciona-se com o **scheduler** criando o ciclo/job seguinte, não com falha de refetch React.

---

## Diagrama causal completo

```
SubscriptionDetail
  handleGenerateBilling()
    │
    ▼
executeDeterministicGenerateRenewal()          ✔ POST /api/crm-subscriptions/:id/manual-renew
    │
    ▼
Backend manualGenerateRenewalNow
  runSynchronousManualPipeline
    executeRenewalJobSynchronously             ✔ persiste invoice + advance next_billing_date
    subscriptionCyclesOnJobCompleted           ✔ marca ciclo atual invoiced
    advanceSubscriptionAfterCompletedCycle     ✔ avança subscription.next_billing_date
    (NÃO chama tryEnqueueRenewalJob…)          ❌ próximo cycle row pode ainda não existir
    │
    ▼
Response 200 → toast.success
    │
    ▼
await load()                                   ✔ GET /api/crm-subscriptions/:id
  setLoading(true) → skeleton (Provider desmonta)
  crmSubscriptionsService.getById(id)
    backend getCrmSubscriptionDetail
      cycles_raw + timeline + validateBillingRuntime   ✔ payload montado
    │
    ▼
setDetail(d) + setLoading(false)             ✔ React state atualizado
    │
    ▼
FinancialEventStoreProvider(detail)
  signature = financialEventStoreSignature(detail)
  useMemo([signature, …])                    ✔ recria SE signature mudou
    createBillingExperienceStore(detail)
      buildBillingAggregateFromDetail(detail)  ✔ pipeline completo (sem memo global)
      buildAggregateStorePrebuilt(aggregate)
      new FinancialEventStore(detail, prebuilt)
    │
    ▼
React filhos (NextInvoiceCard, FinancialCalendar, …)
  store.getNextChargePresentation()            ✔ lê prebuilt do Store novo
  NextInvoiceCard: !next.isProjected         ❌ oculta Gerar se só há projeção
  FinancialCalendarPopover: !projected         ❌ oculta Gerar em dots projetados
```

Legenda: ✔ atualizado conforme esperado | ❌ ponto onde UX parece “travada” (dados ou regra de UI)

---

## Fluxo detalhado pós-Gerar

### 1. Generate

```168:207:src/pages/SubscriptionDetail.tsx
  const handleGenerateBilling = useCallback(
    async (target?: GenerateBillingTarget | ...) => {
      ...
      const result = await executeDeterministicGenerateRenewal({ ... });
      if (result.success) {
        toast.success(...);
        await load();
      } else {
        toast.error(...);
        await load();
      }
    },
    [id, detail, load]
  );
```

### 2. POST (único ponto de API de geração)

```48:99:src/lib/subscriptionBillingGeneration.ts
export async function executeDeterministicGenerateRenewal(...) {
  ...
  return crmSubscriptionsService.generateRenewalNow(params.subscriptionId, { cycleId });
}
```

Endpoint: `POST /api/crm-subscriptions/:id/manual-renew` com `{ cycle_id }`.

**O POST não retorna o payload completo da assinatura** — só `CrmSubscriptionManualRenewalResult`. A UI depende exclusivamente do GET subsequente.

### 3. Refetch

```138:155:src/pages/SubscriptionDetail.tsx
  const load = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      const d = await crmSubscriptionsService.getById(id);
      setDetail(d);
      ...
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);
```

```400:404:src/services/crmSubscriptions.ts
  async getById(id: string): Promise<CrmSubscriptionDetailPayload> {
    const res = await apiClient.get<CrmSubscriptionDetailPayload>(`/api/crm-subscriptions/${id}`);
    ...
    return res.data;
  }
```

- **Sem cache HTTP** customizado no `apiClient` (fetch direto).
- **Sem TanStack Query** para este recurso.
- **Side effect no GET:** `validateBillingRuntime()` repara failed→pending, mas **não provisiona** o próximo `subscription_cycles` row.

### 4. Provider → Store → Aggregate

```24:45:src/components/subscriptions/financial/FinancialEventStoreContext.tsx
export function FinancialEventStoreProvider({ detail, ... }) {
  const signature = financialEventStoreSignature(detail);
  const value = useMemo(
    () => ({
      store: createBillingExperienceStore(detail, todayYmd),
      ...
    }),
    [signature, timeZone, onPaymentConfirmed, todayYmd]
  );
  ...
}
```

```36:59:src/lib/billingCutover/createBillingExperienceStore.ts
function createAggregateFinancialEventStore(detail, todayYmd) {
  const aggregate = buildBillingAggregateFromDetail(detail, today);
  const prebuilt = buildAggregateStorePrebuilt(aggregate, detail);
  return new FinancialEventStore(detail, today, prebuilt);
}
```

**Memoização:** apenas o `useMemo` do Provider, keyed por `financialEventStoreSignature`. Não há singleton global de Store/Aggregate.

---

## Payload antes vs depois (campos auditados)

| Campo | Antes de Gerar | Depois de Gerar (GET bem-sucedido) | Consumidor UI |
|-------|----------------|-------------------------------------|---------------|
| `cycles_raw[]` | Ciclo C com `invoice_id: null` | Ciclo C com `invoice_id` + status invoiced | Aggregate `cycles` stage |
| `cycles_raw[]` | Próximo ciclo C+1 pode **ausentar** | C+1 **pode continuar ausente** até scheduler | `resolveFirstEligibleCycleFromAggregate` |
| `subscription.next_billing_date` | Data do ciclo C | Avançada para C+1 (se pipeline completou) | Projeções UX |
| `timeline[]` | `operational_state: awaiting_generation` | `generated` + `invoice_id` preenchido | **Signature** do Provider |
| `invoices[]` | Sem nova fatura | Nova fatura presente | Aggregate events |
| `latest_invoice_id` | Anterior | Nova fatura | Signature |

**Diferença crítica:** Aggregate decide “próxima cobrança” por **`cycles_raw` elegível**, não por timeline. Signature decide **rebuild do Store** por **timeline**. Em resposta GET consistente (backend monta timeline a partir dos mesmos `cycles`), ambos avançam juntos. Se C+1 não existe em `cycles_raw`, Aggregate cai em **projeção** mesmo com `next_billing_date` já avançado.

---

## Ponto de ruptura (primeira inconsistência UX)

Ordem causal mais provável (evidência código + doc 22B):

1. **Backend:** `advanceSubscriptionAfterCompletedCycle` atualiza `next_billing_date`, mas **criação do row** `subscription_cycles` para C+1 ocorre em `subscriptionCyclesUpsertAfterScheduler`, acionado pelo **scheduler** (`insertOrReactivateRenewalJob`), **não** ao fim de `manualGenerateRenewalNow`.
2. **GET imediato:** retorna payload **válido** com ciclo C faturado + `next_billing_date` novo + **sem** ciclo C+1 pending.
3. **Frontend refresh:** `load()` ✔ → signature muda ✔ → Store/Aggregate **recriados** ✔.
4. **Aggregate:** `resolveNextInvoiceFromAggregate` → sem ciclo elegível → `isProjected: true`.
5. **UI 22B:** `NextInvoiceCard` oculta Gerar quando `next.isProjected` — **parece “não atualizou”**, mas refletiu Aggregate fielmente.

Após **restart backend:** cron/scheduler enfileira próximo job → `subscriptionCyclesUpsertAfterScheduler` → GET passa a incluir C+1 → `isProjected: false` → botão Gerar volta.

---

## Race conditions possíveis (secundárias)

| Cenário | Efeito | Probabilidade |
|---------|--------|---------------|
| GET antes do commit do worker | Payload antigo; signature igual → **Store não recriado** | Baixa em dev local; possível sob carga |
| `load()` concorrente | Último `setDetail` vence | Baixa (single handler) |
| `handleGenerateBilling` catch sem `load()` | UI stale em erro de rede pós-200 | Só em exceção no client após sucesso backend |

---

## Respostas objetivas (checklist DoD)

| Item | Resultado |
|------|-----------|
| GET acontece? | **SIM** — `await load()` após success e failure |
| Payload muda? | **SIM** quando backend persistiu (invoice + timeline); **PARCIAL** se falta ciclo C+1 |
| Aggregate reconstruído? | **SIM** quando signature muda |
| Store recriado? | **SIM** — nova instância `FinancialEventStore` no useMemo |
| Provider recriado? | **SIM** — value do context muda; filhos remontam após skeleton |
| Cache invalidado? | **N/A** — não há camada React Query para este recurso |
| Calendário recebe projeções? | **SIM** até 12 meses via `aggregate.calendar`; dots projetados **sem** Gerar |
| Primeiro ponto exato | **Sem ciclo real C+1 no payload** → Aggregate projected → gates UI 22B |

---

## Referências cruzadas

- `BILLING_STORE_LIFECYCLE.md` — assinatura e caches internos do Store
- `BILLING_PROVIDER_REBUILD_MATRIX.md` — matriz useMemo / deps
- `BILLING_CACHE_INVALIDATION_MATRIX.md` — ausência de React Query
- `BILLING_CALENDAR_REFRESH_TRACE.md` — horizonte calendário
- `GENERATE_BUTTON_INVESTIGATION_22B.md` — gates de UI Gerar
