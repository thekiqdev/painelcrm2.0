# Billing 2.0 — Sprint 9 Closeout

| Campo | Valor |
|-------|-------|
| **Sprint** | 9 — Tokenização / Cartão Automático |
| **Data** | 2026-07-27 |
| **Status** | Implementada — aguardando aprovação |
| **Nota** | Pós-MVP; flag `card_auto_renew` default **OFF** |

## Entregáveis

| Item | Status |
|------|--------|
| Migration `300` — colunas token em `subscriptions` | ✅ |
| Adapter Asaas `creditCardToken` (pay sem PAN) | ✅ |
| Persistência token após pay-with-card OK | ✅ |
| `charge_card` real (sai do stub) | ✅ |
| Renovação captura com token (flag ON + engine OFF) | ✅ |
| Policy `charge_card` (flag ON + engine ON) | ✅ |
| `/saas-pay` — cartão salvo + troca | ✅ |
| Docs PCI ops | ✅ |
| KPI falhas (`card.capture_failed` audit) | ✅ (via audit; contagem helper) |
| Pix Automático | ❌ S10 |

## Critérios de aceite

- [x] Flag OFF → zero mudança no path de renovação legado (sem captura auto)
- [x] Sem PAN/CVV em DB (só token + máscara)
- [x] Falha de captura marca token invalid + audit `card.capture_failed`
- [ ] Smoke staging: token save após pay cartão
- [ ] Smoke: flag ON + token → renovação captura
- [ ] Smoke: falha → fallback PIX (policy `actions_after_fail`)
- [ ] Tokenização habilitada na conta Asaas (prod)

## Rollback

1. `billing2.card_auto_renew` = OFF  
2. Renovação volta a charge aberta  

## APIs / UI

- `POST …/pay-with-card` aceita `use_saved_card: true`
- `GET …/saas-billing/:token` inclui `saved_card: { brand, last4 }`
- UI `/saas-pay` — botão “Pagar com cartão salvo”

## Arquivos

- `database/init/300_billing2_subscription_card_token.sql`
- `packages/backend/src/services/billing2/billingCardTokenStore.ts`
- `packages/backend/src/services/collectionPolicy/execute.ts` (`execChargeCard`)
- `packages/backend/src/services/billingRenewalEngine/executeSaasRenewal.ts`
- `packages/backend/src/modules/gateways/asaas/...`
- `src/pages/PublicSaasBillingPay.tsx`
- [`BILLING2_PCI_CARD_TOKEN_OPS.md`](./BILLING2_PCI_CARD_TOKEN_OPS.md)
