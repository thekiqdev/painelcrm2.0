# BILLING ENGINE V2 — Sprint 3.0D — Billing Persistence Orchestrator

**Data:** 2026-06-26  
**Modo:** PRODUCTION CORE — INTERNAL — Worker/Scheduler inalterados  
**Breaking changes:** Não  
**Database changes:** Não  
**Feature flags:** Nenhuma

---

## Resumo

Introduzida a camada `BillingPersistenceOrchestrator`, que transforma o resultado do `BillingEngineV2` em uma renovação operacional completa: persistência de invoice/itens, gateway, notificações, timeline, histórico e avanço de ciclo — produzindo `BillingRenewalResult` compatível com o Worker.

O motor V2 permanece **puro** (sem efeitos colaterais). Nenhum caller existente foi alterado nesta sprint.

---

## Arquitetura

### Antes

```
BillingExecutionContext → BillingEngineV2 → CustomerInvoiceDraft → Fim
```

### Depois

```
BillingExecutionContext
  → BillingEngineV2.execute()
  → BillingPersistenceOrchestrator
  → Persist Invoice / Items
  → Gateway.createCharge()
  → NotificationEngine
  → Timeline
  → History
  → AdvanceSubscription
  → BillingRenewalResult
```

---

## Novos módulos (`packages/backend/src/billingPersistence/`)

| Módulo | Responsabilidade |
|--------|------------------|
| `billingPersistenceOrchestrator.ts` | Pipeline operacional completo |
| `invoicePersistenceService.ts` | INSERT `customer_invoices` a partir do draft |
| `invoiceItemPersistenceService.ts` | INSERT `customer_invoice_items` |
| `gatewayExecutionService.ts` | Cobrança real via gateway ativo |
| `notificationExecutionService.ts` | `notifyInvoiceCreated` (`origin_kind: renewal_v2`) |
| `timelineExecutionService.ts` | Escrita em `billing_recovery_audit` |
| `historyExecutionService.ts` | `recordRenewalHistory` |
| `subscriptionCycleService.ts` | `advanceSubscriptionAfterCompletedCycle` |
| `renewalResultBuilder.ts` | Monta `BillingRenewalResult` |
| `orchestratorLogger.ts` | Logs `[PERSISTENCE_ORCHESTRATOR]`, etc. |
| `types.ts` | Contratos públicos |
| `index.ts` | Exports |

**Versão:** `v2_persistence_orchestrator_sprint_3_0d`

---

## Contrato público

```typescript
BillingPersistenceOrchestrator.execute(input): Promise<BillingPersistenceStageResult>
// input.renewal → BillingRenewalResult (compatível com Worker)
```

---

## Pipeline do Orchestrator

1. **Idempotência** — `findCustomerInvoiceBySubscriptionAndPeriod`; reutiliza invoice existente sem chamar engine
2. **Engine** — `BillingEngineV2.execute({ context })` (inalterado)
3. **Persistência** — invoice + itens; rollback de invoice se itens falharem
4. **Notificações** — antes do gateway (padrão V1)
5. **Gateway** — `createCharge` + `updateCustomerInvoiceGatewayData`
6. **Timeline** — eventos do engine
7. **Advance** — avanço de ciclo da assinatura
8. **History** — registro de renovação
9. **Result** — `buildBillingRenewalResult`

---

## Logs estruturados

- `[PERSISTENCE_ORCHESTRATOR]`
- `[PERSIST_INVOICE]`
- `[PERSIST_ITEMS]`
- `[GATEWAY_EXECUTION]`
- `[NOTIFICATION_EXECUTION]`
- `[TIMELINE_EXECUTION]`
- `[HISTORY_EXECUTION]`
- `[SUBSCRIPTION_ADVANCE]`
- `[ORCHESTRATOR_RESULT]`

---

## Princípios respeitados

| Princípio | Status |
|-----------|--------|
| BillingEngineV2 puro, sem side effects | ✅ |
| Toda escrita passa pelo Orchestrator | ✅ |
| Worker não conhece BillingEngineV2 | ✅ (não wired nesta sprint) |
| BillingRenewalEngine V1 inalterado | ✅ |
| Scheduler inalterado | ✅ |
| APIs inalteradas | ✅ |
| Sem recálculo de preços/descontos/impostos | ✅ |
| Sem consulta a invoice anterior | ✅ |

---

## Explicitamente não alterado

- `BillingRenewalEngine`
- `executeCustomerRenewal`
- `runRecurringWorker` / `runRecurringScheduler`
- `BillingExecutionContextBuilder`
- `BillingEngineV2`
- Módulo Gateway
- Notification Engine

---

## Testes

**Arquivo:** `billingPersistenceOrchestrator.test.ts`  
**Total:** 26 cenários (mínimo exigido: 20)

| Cenário | Coberto |
|---------|---------|
| Persistência completa | ✅ |
| Falha gateway (renewal continua) | ✅ |
| Falha notification | ✅ |
| Rollback transacional (itens) | ✅ |
| Idempotência | ✅ |
| History failed | ✅ |
| Timeline failed | ✅ |
| Advance subscription | ✅ |
| `BillingRenewalResult` compatível | ✅ |
| Sem dependência do motor legado | ✅ (4 arquivos × 4 símbolos proibidos) |

```bash
npx vitest run src/billingPersistence/billingPersistenceOrchestrator.test.ts
# 26 passed
npm run build
# OK
```

---

## Definition of Done

| Item | Status |
|------|--------|
| BillingEngineV2 continua puro | ✅ |
| Orchestrator gera BillingRenewalResult | ✅ |
| Persistência operacional completa | ✅ |
| Gateway integrado | ✅ |
| Notificações integradas | ✅ |
| Timeline integrada | ✅ |
| Histórico integrado | ✅ |
| AdvanceSubscription integrado | ✅ |
| Build limpo | ✅ |
| Todos os testes passando | ✅ |

---

## Próxima sprint

**3.0E — Billing Renewal Result Adapter** — adaptar o Worker para consumir o Orchestrator sem quebrar contratos existentes.
