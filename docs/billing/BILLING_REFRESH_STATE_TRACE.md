# Sprint 5.0-22C — Billing Refresh State Trace

**Modo:** INVESTIGATION (READ ONLY)  
**Data:** 2026-07-04  
**Hipótese ZERO:** nenhuma conclusão sem evidência de código ou harness runtime.

---

## Veredicto executivo

| Camada | Após Generate + `load()` | Evidência |
|--------|--------------------------|-----------|
| POST manual-renew | ✅ Persiste invoice/ciclo | Backend trace + código |
| GET detail | ✅ Executado automaticamente | `SubscriptionDetail.tsx:194` |
| Payload React `detail` | ✅ Substituído via `setDetail` | `load():142-143` |
| `financialEventStoreSignature` | ✅ Muda quando invoice/`next_billing_date`/timeline mudam | Teste 4.2Q |
| BillingAggregate | ✅ Reconstruído **se** signature mudar | `createBillingExperienceStore` |
| FinancialEventStore | ✅ Nova instância **se** signature mudar | Provider `useMemo` |
| UI (card/calendário) | ⚠️ Reflete Aggregate **do payload recebido** — pode diferir do pós-restart | Golden snapshots |

**Causa raiz (evidência combinada):** o frontend **atualiza** Store/Aggregate após Generate quando o GET devolve payload diferente (signature muda). O comportamento “volta ao normal após restart” correlaciona-se com **payload diferente após restart** (scheduler materializa `subscription_cycles` C+1), não com falha de refetch React. Segunda causa documentada: **colisão de signature** pode manter Store antigo se payload mudar só fora dos campos assinados.

---

## Runtime Trace completo

```
POST Generate (manual-renew)
  ✅ Backend: invoice + cycle invoiced + advance next_billing_date
  ❌ Backend: NÃO chama tryEnqueueRenewalJobForSubscriptionId ao fim do manual pipeline
  ↓
GET /api/crm-subscriptions/:id
  ✅ Sempre após success/error em handleGenerateBilling
  ✅ validateBillingRuntime no backend (repara failed, NÃO cria ciclo C+1)
  ↓
setDetail(payload)
  ✅ React state owner: SubscriptionDetail
  ↓
financialEventStoreSignature(detail)
  ✅/❌ Se igual ao anterior → Provider NÃO recria Store
  ↓
createBillingExperienceStore(detail)
  ✅ 1× por rebuild
  buildBillingAggregateFromDetail → runBillingAggregatePipeline (11 stages)
  buildAggregateStorePrebuilt → new FinancialEventStore(prebuilt)
  ↓
Adapters (calendar, history, nextInvoice, sidebar, uiCapabilities)
  ✅ Sem memo — map 1:1 do aggregate
  ↓
FinancialCalendar / NextInvoiceCard / FinancialHistory
  ✅ Leem store; card aplica gates adicionais (!isProjected)
  ↓
Render
  ✅/⚠️ Correto para payload recebido; pode parecer “stale” vs pós-restart
```

---

## Respostas objetivas (1–15)

### 1. GET após POST generate-renewal?

**SIM.**

| Item | Valor |
|------|-------|
| Arquivo | `src/pages/SubscriptionDetail.tsx` |
| Hook/função | `handleGenerateBilling` → `load()` |
| Mutation | Não há — POST via `executeDeterministicGenerateRenewal` |
| invalidate | **Não existe** |
| refetch | `await load()` → `crmSubscriptionsService.getById(id)` |

### 2. Payload ANTES vs DEPOIS

Evidência harness: `tests/billing/certification/captureVisualFixture.ts` + snapshots golden.

| Campo | BEFORE (`scheduler-renewal`) | AFTER generate-like (`charge-early-generated` / `projection-only`) |
|-------|------------------------------|----------------------------------------------------------------------|
| Nova invoice | ❌ | ✅ `inv-early` / stats alterados |
| Novo cycle row C+1 | ✅ `c-sched` pending | ❌ ausente em `projection-only` |
| Status cycle gerado | pending | invoiced |
| `next_billing_date` | 2026-07-14 | avançado / 2026-08-14+ |
| `timeline` | awaiting_generation | generated + invoice_id |
| `generateCycleIds` | `["c-sched"]` | `[]` |

**Novo ciclo após Generate?** Depende do backend — **não garantido** no GET imediato (código: `manualGenerateRenewalNow` não enfileira próximo ciclo).  
**Nova invoice?** **SIM** quando POST succeeds (evidência cenário `charge-early-generated`).  
**Alteração de status?** **SIM** (timeline + cycles_raw invoiced).

### 3–4. `createBillingExperienceStore` / AggregateBuilder

| Métrica | Valor |
|---------|-------|
| Execuções após rebuild | **1×** por mudança de signature |
| Argumentos | `(detail, todayYmd)` |
| sourceSignature | `financialEventStoreSignature(detail)` = `aggregate.sourceSignature` |
| aggregate hash | `billingAggregateSignature(aggregate)` — muda com contadores + sourceSignature |

Pipeline: `BILLING_AGGREGATE_PIPELINE_STAGES` × 11, sem memo global.

### 5. Aggregate pós-Generate vs pós-restart

Comparável via snapshots certificados (`todayYmd: 2026-06-30`):

| Campo | pós-Generate-like | pós-restart-like (`scheduler-renewal`) |
|-------|-------------------|----------------------------------------|
| `events` | +invoice events | +1 real upcoming |
| `calendar` | 12–14 eventos, projeções | 13 (1 real + 12 projected) |
| `nextInvoice.cycleId` | `null` (projected) | `c-sched` |
| `nextInvoice.isProjected` | `true` | `false` |
| `history.generateCycleIds` | `[]` | `["c-sched"]` |
| `capabilities.generateCycleIds` | `[]` | `["c-sched"]` |
| `sidebar.openAmount` | pode subir (fatura aberta) | `R$ 0,00` |
| `alerts` | pode incluir overdue | cenário-dependente |

### 6. Provider reconstruído?

**Condicional.** `useMemo([signature, timeZone, onPaymentConfirmed, todayYmd])`. Sem `key` no Provider. Instância antiga vive se **signature igual**.

### 7. FinancialEventStore recriado?

**Condicional.** Constructor recebe novo `prebuilt`; `_nextChargeCache`, `_calendarCache` etc. preenchidos no ctor (path 22B). Ponteiros `aggregate` em `aggregateFacade.aggregate`.

### 8. Memoização adapters

**Nenhuma** em `buildAggregateStorePrebuilt`, `billingViewAdapter`, `calendarAdapter`, `historyAdapter`, `nextInvoiceAdapter`, `sidebarAdapter`. Dependência única: `(aggregate, detail)` ou `(aggregate, caps)`.

### 9–11. Calendar / NextInvoice / Capabilities

Ver deliverables dedicados. Resumo: **12 projeções** fluem Aggregate→Store; React filtra por **mês**; `generateCycleIds` **atualiza** se Store rebuild + payload com ciclos elegíveis.

### 12. React Query?

**Não.** Detail não usa query key / staleTime / gcTime.

### 13. F5 vs restart frontend

**Equivalentes** para billing detail: `useEffect([load])` + mesmo GET. Sem cache persistente billing.

### 14. Navegar outra assinatura vs restart

**Navegar:** desmonta página, novo `detail`, novo Store. **Restart backend:** mesmo GET path + **scheduler** pode alterar payload (INSERT `subscription_cycles`).

### 15. Race condition?

Ordem implementada: POST → await load → GET → setDetail → Provider. **Possível:** GET antes de commit (signature igual → Store stale). **Possível:** GET com payload intermediário (signature muda → Store fresh mas Aggregate “projection-only”).

---

## Mandatory Evidence (hashes / contadores)

Fonte: golden certification snapshots (`tests/billing/snapshots/*.json`), reproduzíveis via `captureBillingVisualFixture`.

| Estado | sourceSignature muda? | calendarCount | projectedCount | generateCycleIds | showGenerate |
|--------|----------------------|---------------|----------------|------------------|--------------|
| `scheduler-renewal` | baseline | 13 | 12 | `["c-sched"]` | true |
| `charge-early-generated` | sim | 14 | 12 | `[]` | false |
| `projection-only` | sim | 12 | 12 | `[]` | false |

**Se hash/signature permanece igual após Generate:** Store **não** reconstrói — explicado por campos mutados fora de `financialEventStoreSignature` (ex.: `cycles_raw.status`/`job_id` sem alteração de timeline). Teste 4.2Q prova que **timeline** mutation altera signature; mutação só em `cycles_raw` **não** está coberta por teste mas é gap arquitetural documentado.

---

## Ponto exato onde o estado “para”

1. **Primário (payload):** GET pós-Generate devolve assinatura **sem** ciclo elegível C+1 → Aggregate certificado em modo `projection-only` → UI correta para esse payload, divergente do pós-restart.
2. **Secundário (frontend):** `financialEventStoreSignature` igual → Provider **reutiliza** Store com Aggregate anterior (colisão).
3. **Terciário (UI gate):** Store fresh com `isProjected: true` → `NextInvoiceCard` oculta Gerar (`!next.isProjected`) — não é Store stale.

**Evidência runtime backend:** traces em `storage/debug/billing-runtime/` mostram `subscriptionCyclesUpsertAfterScheduler` após ticks de scheduler, não correlacionados ao instante do POST manual.
