# Next Invoice Pipeline Report — Sprint 4.1K

## Objetivo

Pipeline contínuo de antecipação: após cada geração manual, a **próxima competência sem invoice** aparece automaticamente em todos os blocos financeiros.

## Problema resolvido

O card **Próxima cobrança** usava `automation_summary.next_charge_ymd` e devolvia ciclos **já faturados**, impedindo a promoção automática da competência seguinte.

## Solução

| Camada | Artefato |
|--------|----------|
| Resolver canônico | `src/lib/subscriptionNextInvoiceResolver.ts` |
| Experiência UI | `resolveNextInvoiceExperience()` delega ao resolver |
| Store | `financialEventStoreSignature` inclui `latest_invoice_id` |
| Cache | WeakMap removido — store recriado a cada mudança de assinatura |

## Fluxo pós-geração

```
generateRenewalNow() → load() → detail atualizado
  → FinancialEventStoreProvider (nova signature)
  → NextInvoiceCard / Calendar / History / KPIs / Sidebar
```

Sem F5 — apenas `setDetail` via `load()`.

## Fluxo infinito esperado

```
21/07 → Gerar → invoice no histórico → 28/07 no card
28/07 → Gerar → 04/08 no card
04/08 → Gerar → 11/08 no card
…
```

_Sprint 4.1K_
