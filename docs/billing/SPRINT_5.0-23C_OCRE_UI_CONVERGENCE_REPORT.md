# Sprint 5.0-23C — OCRE Integration & UI Convergence Report

**Data:** 2026-07-06  
**Status:** IMPLEMENTED  
**Dependências:** Sprint 5.0-23B (OCRE)

---

## Objetivo

Convergir toda a UI financeira para o OCRE e `ResolvedCompetencyPresentation`, sem alterar regras de domínio.

---

## Novos módulos

| Módulo | Responsabilidade |
|--------|------------------|
| `billingStatusPresentation.ts` | Rótulos PT-BR — nunca exibir enums internos |
| `resolvedCompetencyPresentation.ts` | `ResolvedCompetencyPresentation` — contrato único da UI |

---

## Correções

| Problema | Solução |
|----------|---------|
| `findCycleById is not defined` | Import em `subscriptionBillingGeneration.ts` |
| Status `pending`/`queued`/`failed` na UI | `billingStatusLabel()` em History/Calendar adapters |
| History sem botão Gerar | OCRE `HISTORY` por linha no store e aggregate adapter |
| Calendar decisão local | `store.resolveCyclePresentation(cycleId, 'CALENDAR')` |
| NextInvoice resolução própria | OCRE `NEXT_CARD` em `resolveNextChargePresentation` |

---

## Componentes migrados

NextInvoiceCard, FinancialHistoryRow, FinancialCalendarPopover, FinancialSummarySidebar, UpcomingPaymentsList, InvoiceDirectActions — todos usam `canGenerate`/`canOpen`/`canReprocess` do OCRE.

---

## Testes

- `subscriptionFinancialOcreConvergence.test.ts` (novo)
- `npm run test:billing` → **738/738**
