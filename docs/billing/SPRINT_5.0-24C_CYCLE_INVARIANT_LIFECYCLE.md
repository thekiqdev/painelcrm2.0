# Sprint 5.0-24C — Invariantes + Lifecycle (backend)

**Data:** 2026-07-07  
**Modo:** IMPLEMENTAÇÃO (backend only)

## Decisões permanentes

| ID | Regra |
|----|-------|
| **INV-19** | `status = invoiced` ⇒ `invoice_id` válido (estado estável) |
| **INV-20** | Purge de invoice ⇒ `invoiced → pending` via `SubscriptionCycleLifecycle` |

## Entregas

| Componente | Mudança |
|------------|---------|
| `subscriptionCycleLifecycleService.ts` | **Novo** — `reopenCyclesAfterInvoiceRemoved`, `repairInvoicedCyclesWithoutInvoice`, batch repair |
| `customerInvoiceAdminService.ts` | Delete chama lifecycle (remove SQL inline) |
| `subscriptionCycleRepairService.ts` | Auto-repair INV-19 no `repairRecoverableSubscriptionCycles` |
| `billingRuntimeValidator.ts` | Log `invoiced_invariant_reopened` após repair no GET |
| `billingCycleInvoiceGenerationService.ts` | Repair antes de `manual-renew` |
| `billingRecoveryService.ts` | Orphan `invoiced`+null → `pending` (não `failed`) |
| `subscriptionCycleMaterializer.ts` | Protege `invoiced` só quando `invoice_id IS NOT NULL` |
| `POST .../repair-cycle-invariants` | Repair manual por assinatura/ciclo (prep 24D UI) |

## Legado (faturas excluídas antes da regra)

Ciclos `invoiced` + `invoice_id = NULL` são reparados automaticamente em:

1. **GET assinatura** (`validateBillingRuntime`)
2. **POST manual-renew** (pré-resolução OCRE)
3. **POST repair-cycle-invariants** (explícito)
4. **billing recovery** batch

Sem SQL manual necessário após deploy.

## Critérios de aceite

- [x] Delete físico de invoice reabre ciclo (`pending`)
- [x] Zombie legado reparado no GET e no manual-renew
- [x] Materializer não perpetua `invoiced` sem invoice
- [x] Recovery usa `pending` para orphans
- [x] Endpoint repair exposto

## Próximo sprint (24D)

UI: ícone ⚠️ + botão “Corrigir” consumindo `POST repair-cycle-invariants`.
