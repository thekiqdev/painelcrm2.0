# BILLING ENGINE V2 — Sprint 3.1 — Worker Cutover

**Data:** 2026-06-26  
**Modo:** PRODUCTION CUTOVER  
**Breaking changes:** Sim (CRM)  
**Database changes:** Não  
**Feature flags:** Nenhuma

---

## Resumo

Primeiro cutover operacional: o Worker CRM deixa de usar `BillingRenewalEngine` → `executeCustomerRenewal` e passa a executar exclusivamente:

```
BillingExecutionContextBuilder → BillingEngineV2 → BillingPersistenceOrchestrator → BillingRenewalResult
```

Renovações **SaaS** continuam via `BillingRenewalEngine` → `executeSaasRenewal` (inalterado).

---

## Arquitetura

### Antes

```
Worker → processNextBatch → BillingRenewalEngine → executeCustomerRenewal → Invoice Copy → Gateway → History
```

### Depois

```
Worker → processNextBatch → executeWorkerCrmRenewal
  → BillingExecutionContextBuilder
  → BillingPersistenceOrchestrator (Engine V2 + persistência)
  → completeBillingRecurringJob
  → BillingRenewalResult
```

---

## Alterações

| Arquivo | Mudança |
|---------|---------|
| `workerCrmRenewalPipeline/workerCrmRenewalPipeline.ts` | **Novo** — pipeline CRM V2 do Worker |
| `workerCrmRenewalPipeline/workerV2Logger.ts` | **Novo** — logs `[WORKER_V2]`, etc. |
| `recurringBillingJobService.ts` | CRM usa `executeWorkerCrmRenewal` |
| `billingRenewalEngine.ts` | CRM bloqueado (`crm_use_worker_v2_pipeline`); SaaS mantido |

---

## Validações obrigatórias (Worker)

- `context_certified === true`
- `context_pure === true`
- Billing Plan persistido
- Billing Items persistidos
- Sem fallback para `executeCustomerRenewal`
- Sem consulta a invoice anterior como template

---

## Logs

- `[WORKER_V2]`
- `[WORKER_CONTEXT]`
- `[WORKER_ENGINE_V2]`
- `[WORKER_PERSISTENCE]`
- `[WORKER_COMPLETE]`

---

## Removido do runtime CRM

- `executeCustomerRenewal` (código morto — remoção na Sprint 3.2)
- `resolveCrmRenewalPreviousInvoice`
- `getCustomerInvoiceItems` como template
- `overlayCrmContractOnRenewalItems`
- Fallback legado no Worker CRM

---

## Mantido temporariamente

- `executeSaasRenewal`
- `executeCustomerRenewal.ts` (sem callers CRM)
- `legacyRenewalNormalizer`
- `BillingRenewalEngine` (SaaS + guard CRM)

---

## Renovação manual

`manualRenewSubscription` → `runSynchronousManualPipeline` → `executeRenewalJobSynchronously` → `processNextBatch` — **mesmo pipeline V2** do Worker (`manualExecution: true`).

---

## Testes

```bash
npx vitest run src/services/workerCrmRenewalPipeline/workerCrmRenewalPipeline.test.ts
npx vitest run src/services/billingRenewalEngine/billingRenewalEngine.test.ts
# 45 passed (mínimo exigido: 40)
npm run build
```

Cenários: Worker completo, manual, retry, idempotência, gateway, notification, timeline, history, advance, validações de contexto, bloqueio CRM no engine, paridade `BillingRenewalResult`.

---

## Success criteria

| Critério | Status |
|----------|--------|
| Renovações CRM exclusivamente V2 | ✅ |
| Sem template de invoice | ✅ |
| Sem fallback legado | ✅ |
| `BillingRenewalResult` compatível | ✅ |
| Gateway / notifications / timeline / history | ✅ (via Orchestrator) |
| Build limpo | ✅ |
| Testes aprovados | ✅ |

---

## Próxima sprint

**3.2 — Legacy Removal** — remover `executeCustomerRenewal`, `crmRenewalCustomerResolver` e overlay legado.
