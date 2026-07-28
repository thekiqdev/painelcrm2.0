# Billing 2.0 — Sprint C Closeout (switch Pix Auto / SSOT)

| Campo | Valor |
|-------|-------|
| **Sprint** | C — switch ON/OFF com fonte única na assinatura |
| **Data** | 2026-07-28 |
| **Status** | Implementada — aguardando smoke staging |
| **SSOT** | `subscriptions.pix_automatic_auth_*` (não na fatura) |

## Decisão

- Switch nas telas de **aquisição / renovação / Meu plano** lê e escreve a **mesma** preferência  
- **OFF** → cancela autorização no Asaas + status local `cancelled`  
- **ON** → inicia jornada (precisa fatura aberta de plano)  
- Paid manual **não** cancela auth (Sprint B)  
- Cancelamento de plano **cancela** auth  

## Entregáveis

| Item | Status |
|------|--------|
| `getPixAutomaticPreferenceForTenant` / enable / cancel service | ✅ |
| `GET/POST /api/me/tenant/pix-automatic*` | ✅ |
| `POST …/cancel-pix-automatic` (público saas-pay) | ✅ |
| Hook `cancelSubscription` + `expireCancelledSubscriptions` | ✅ |
| Componente `PixAutomaticConsentSwitch` | ✅ |
| Wire: saas-pay, Meu plano, PlanCheckout, InternalBillingCheckout | ✅ |
| Seat/instance addon: switch **não** aparece | ✅ |
| Testes Sprint C | ✅ |

## Critérios de aceite

- [x] Uma API de preferência; telas só consomem  
- [x] Switch OFF cancela auth (não payments do ciclo)  
- [x] Cancel plano cancela auth  
- [x] Flag OFF → `available: false` (UI some)  
- [ ] Smoke: Meu plano OFF → Asaas auth cancelada  
- [ ] Smoke: saas-pay ON → QR composto; mesmo status no Meu plano  
- [ ] Smoke: cancel assinatura → auth cancelled  

## Arquivos

- `packages/backend/src/services/billing2/billingPixAutomaticService.ts`
- `packages/backend/src/controllers/myTenantSubscriptionController.ts`
- `packages/backend/src/controllers/publicSaasBillingController.ts`
- `packages/backend/src/services/billingSubscriptionService.ts`
- `src/components/billing/PixAutomaticConsentSwitch.tsx`
- `src/services/tenantPixAutomatic.ts`
- `src/pages/PublicSaasBillingPay.tsx`, `MeuPlano.tsx`, `PlanCheckout.tsx`, `InternalBillingCheckout.tsx`
- Ops: [`BILLING2_PIX_AUTOMATIC_OPS.md`](./BILLING2_PIX_AUTOMATIC_OPS.md)

## Rollback

1. Flag `billing2.pix_automatic` OFF  
2. UI some; auth existentes ficam no Asaas até cancel manual/ops  
