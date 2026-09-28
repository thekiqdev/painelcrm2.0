# Sprint 5.0-23E — Finish Billing 1.0 (Behavior Completion)

**Data:** 2026-07-06  
**RC corrigido (23D):** `POST_MANUAL_ENQUEUE_NEXT` usava `tryEnqueueRenewalJobForSubscriptionId` e abortava com `next_billing_after_db_today` antes de materializar C+1.

---

## Arquivos alterados

| Arquivo | Motivo |
|---------|--------|
| `packages/backend/src/services/billingManualRenewalService.ts` | Após POST manual com sucesso, materializa `next_billing_date` via `materializePlannedCycles` (ADR-002). Remove dependência de `tryEnqueueRenewalJobForSubscriptionId` para criar competência. |
| `packages/backend/src/services/customerInvoiceAdminService.ts` | Ao apagar invoice, reativa cycle (`status invoiced → pending`, `invoice_id NULL`). |
| `src/lib/resolvedCompetencyPresentation.ts` | Regra UI History/Calendar/NextCard: `invoice_id` presente → Abrir; ausente → Gerar. |
| `src/lib/billingCutover/adapters/historyAdapter.ts` | Mesma regra no Aggregate history. |
| `src/lib/subscriptionFinancialEvents.ts` | NextInvoiceCard: ação por `invoice_id` do cycle, não só OCRE. |
| Testes (backend + frontend + golden + 4.2L) | Alinhados ao comportamento 23E. |

---

## O que NÃO foi alterado

- OCRE core (`operationalCompetencyResolverCore.ts`)
- Planner / Materializer (`subscriptionCyclePlanner.ts`, `subscriptionCycleMaterializer.ts`)
- Aggregate builder
- Scheduler (`enqueueRenewalJobs`, `generation_date`, janela timezone)
- Worker, WhatsApp, Email, Gateway

---

## Testes

`npm run test:billing` — **738/738** verde.

---

## Verificação manual no navegador (pendente operador)

1. Gerar próxima competência sem restart  
2. Apagar invoice e gerar novamente  
3. Gerar competências antigas (Jun → Jul → Ago)  
4. Scheduler continua criando cobranças automáticas  
