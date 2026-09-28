# Sprint fix — 1ª fatura no ciclo + Cancelar (ativa/pausada)

| Campo | Valor |
|-------|-------|
| **Data** | 2026-07-30 |
| **Escopo** | A + B + C (1 sprint curto) |

---

## Entregue

| Ponto | Status |
|-------|--------|
| **A** — `createRecurringManualInvoice` materializa ciclo da 1ª fatura | ✅ `attachCustomerInvoiceToSubscriptionCycle` |
| **C** — Repair lazy no `getCrmSubscriptionDetail` (faturas órfãs) | ✅ `repairOrphanCustomerInvoicesWithoutCycles` |
| **B** — Cancelar/Encerrar em Configurações para `active` **e** `paused` | ✅ UI + `cancelCrmCustomerSubscription` |

---

## Comportamento

1. Nova assinatura → ciclo `invoiced` com `invoice_id` → histórico/calendário mostram a 1ª fatura.
2. Assinatura antiga ao abrir o detalhe → repair liga faturas sem ciclo.
3. Configurações: **Cancelar** (fim do período) e **Encerrar agora** se ativa ou pausada (+ permissão).

---

## Ficheiros

- `packages/backend/src/services/crm/crmSubscriptionInvoiceCycleLink.ts`
- `customerBillingService.ts`, `crmSubscriptionsService.ts`
- `SubscriptionSettingsActions.tsx`

---

## Próximo

Plano de follow-up (Gerar próxima, resumo/edição de ciclos, `finishDate` Asaas, enforce + Finalizada):

→ [`PLAN_CYCLES_PIX_AUTO_FINISHDATE_GENERATE_NEXT.md`](./PLAN_CYCLES_PIX_AUTO_FINISHDATE_GENERATE_NEXT.md)
