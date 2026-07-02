# Timezone Certification — Sprint 4.1M

## Cenários

| Cenário | Esperado | Teste |
|---------|----------|-------|
| Servidor UTC, conta SP, 02:30 UTC dia 01/07 | `financialTodayYmd('America/Sao_Paulo')` = **30/06** | `billingSafeDate.test.ts` |
| Servidor UTC, conta UTC, 02:30 UTC dia 01/07 | `financialTodayYmd('UTC')` = **01/07** | idem |
| Fuso inválido | fallback `America/Sao_Paulo` | idem |
| Store financeiro | `today` alinhado ao fuso do `detail` | `FinancialEventStoreProvider` |

## Status

**Certified** para camada de apresentação financeira da assinatura (dialog, store, accordion técnico).

Billing Engine / Worker / Scheduler **não alterados**.
