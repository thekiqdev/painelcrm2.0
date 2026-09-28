# BILLING ENGINE V2 — Sprint 3.0B — BillingExecutionContext Independence

**Data:** 2026-06-26  
**Modo:** REFACTOR — INTERNAL — ZERO FUNCTIONAL CHANGE (Worker/V1 inalterados)

---

## Resumo

O `BillingExecutionContextBuilder` foi desacoplado do motor legado. O contexto de execução V2 é produzido **exclusivamente** a partir de **Billing Plan persistido** + **Billing Plan Items efetivos**. Fallbacks via `resolveCrmRenewalPreviousInvoice`, `getCustomerInvoiceItems` e `buildBillingItemsFromInvoice` foram removidos.

---

## Alterações principais

| Módulo | Mudança |
|--------|---------|
| `planItemResolver.ts` | Reescrito — só repositórios; erros estruturados |
| `billingExecutionContextBuilder.ts` | Certificação + logs `[CONTEXT_*]` |
| `contextIndependenceGuard.ts` | **Novo** — validação de proveniência |
| `contextIndependenceLogger.ts` | **Novo** — logs de independência |
| `errors.ts` | **Novo** — `BillingExecutionContextError` |
| `types.ts` | `plan_source` = `persisted_plan` apenas; novos diagnostics |

---

## Removido

- `virtualPlanFromSubscription()`
- `virtual_from_invoice_template` / `virtual_from_subscription`
- `invoice_items_snapshot` no metadata
- Fallback `resolveCrmRenewalPreviousInvoice` + `getCustomerInvoiceItems`
- `buildBillingItemsFromInvoice()` no caminho do builder
- Itens virtuais `ctx-item-*` derivados de invoice

---

## Novo contrato

### `resolvePlanAndItems`

| Condição | Resultado |
|----------|-----------|
| Sem plano persistido | `BILLING_PLAN_NOT_FOUND` |
| Sem items efetivos | `BILLING_ITEMS_NOT_FOUND` |
| `legacy_invoice_copy` | `LEGACY_PLAN_STRATEGY` |
| Marcadores legados em items | `LEGACY_ITEM_DETECTED` |
| Sucesso | `planSource: 'persisted_plan'`, `hasPersistedPlan: true` |

### Diagnostics

- `billing_plan_present`
- `billing_items_present`
- `context_certified`
- `context_pure`
- `legacy_dependencies_detected`

### Metadata

- `context_certified: boolean`
- `has_persisted_plan: true` (obrigatório)
- `plan_source: 'persisted_plan'` (único valor)

---

## Logs

- `[CONTEXT_INDEPENDENCE] build_start | build_complete`
- `[CONTEXT_CERTIFIED]`
- `[CONTEXT_LEGACY_REJECTED]`

---

## Engine Guard (alinhamento mínimo)

`billingEngineContextGuard.ts` atualizado para exigir:

- `metadata.context_certified === true`
- `diagnostics.context_pure === true`

---

## Testes

```bash
cd packages/backend
npx vitest run src/billingExecutionContext
```

**174+ testes** no pacote `billingExecutionContext` (inclui 158 de varredura estática + guard).

---

## Impacto em produção V1

**Nenhum.** Worker, Scheduler e `executeCustomerRenewal` não utilizam o builder V2.

Camadas READ (Shadow, Projection, Certification) passam a **falhar explicitamente** para assinaturas sem Billing Plan/Items persistidos — comportamento desejado para pipeline V2.

---

## Próximo passo

**Sprint 3.0C** — Production Readiness Audit (desbloqueada).
