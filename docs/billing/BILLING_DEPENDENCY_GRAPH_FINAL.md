# Billing Engine 3.0 — Dependency Graph Final

**Data:** 2026-06-26  
**Sprint:** 3.2A Final Audit

---

## CRM Renewal — Production (único caminho)

```mermaid
flowchart TD
  subgraph Worker
    RBJ[recurringBillingJobService.processNextBatch]
    EWR[executeWorkerCrmRenewal]
  end

  subgraph Context
    ECB[BillingExecutionContextBuilder]
    PIR[resolvePlanAndItems]
    BPR[(billing_plans)]
    BPI[(billing_plan_items)]
    GUARD[contextIndependenceGuard]
  end

  subgraph Engine
    BE[BillingEngine.execute]
    PIPE[billingEnginePipeline]
    PROJ[billingProjection calculators]
  end

  subgraph Execution
    ORCH[BillingExecutionOrchestrator.execute]
    INV[invoicePersistenceService]
    ITM[invoiceItemPersistenceService]
    GW[gatewayExecutionService]
    NTF[notificationExecutionService]
    TL[timelineExecutionService]
    HIST[historyExecutionService]
    ADV[subscriptionCycleService]
  end

  RBJ -->|type=customer| EWR
  EWR --> ECB
  ECB --> PIR
  PIR --> BPR
  PIR --> BPI
  PIR --> GUARD
  EWR --> BE
  BE --> PIPE
  PIPE --> PROJ
  EWR --> ORCH
  ORCH --> BE
  ORCH --> INV
  ORCH --> ITM
  ORCH --> GW
  ORCH --> NTF
  ORCH --> TL
  ORCH --> HIST
  ORCH --> ADV
```

---

## SaaS Renewal — Parallel (não CRM)

```mermaid
flowchart LR
  RBJ[recurringBillingJobService] --> BRE[BillingRenewalEngine.execute]
  BRE --> SAAS[executeSaasRenewal]
```

CRM `customer` type é **bloqueado** em `BillingRenewalEngine` (`crm_use_worker_v2_pipeline`).

---

## Observability (sidecar, não altera fatura)

```mermaid
flowchart LR
  EWR[executeWorkerCrmRenewal] --> OBS[billingObservability]
  RBJ --> SHADOW[runBillingShadowComparison]
  SHADOW -.->|if BILLING_PLAN_V2_SHADOW| NORM[legacyRenewalNormalizer]
```

Shadow **não** está no caminho crítico de geração de invoice CRM.

---

## Módulos removidos — sem arestas

```
executeCustomerRenewal          ✗
crmRenewalCustomerResolver      ✗
crmSubscriptionContractRenewalOverlay ✗
buildBillingItemsFromInvoice    ✗
billingEngineV2/                ✗
billingPersistence/             ✗
```

---

## Imports verificados

| From | To | Status |
|------|-----|--------|
| `workerCrmRenewalPipeline.ts` | `billingExecutionOrchestrator.js` | ✅ |
| `billingExecutionOrchestrator.ts` | `billingEngine.js` | ✅ |
| `planItemResolver.ts` | `billingPlanRepository`, `billingPlanItemRepository` | ✅ |
| `planItemResolver.ts` | `customerInvoiceService` (template) | ✗ ausente |

---

## Conclusão

Grafo CRM de produção é **único e acíclico** em direção ao motor 3.0. Não existe aresta para o motor legado de cópia de faturas.
