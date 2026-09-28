# Billing 2.0 — Sprint 10 Closeout

| Campo | Valor |
|-------|-------|
| **Sprint** | 10 — Pix Automático |
| **Data** | 2026-07-27 |
| **Status** | Implementada — aguardando aprovação |
| **Nota** | Pós-MVP; flag `pix_automatic` default **OFF** |

## Entregáveis

| Item | Status |
|------|--------|
| Migration `301` — colunas auth em `subscriptions` | ✅ |
| Store + janela 2–10 dias úteis | ✅ |
| Adapter Asaas create/get/cancel auth + `pixAutomaticAuthorizationId` em charge | ✅ |
| Webhooks `PIX_AUTOMATIC_*` | ✅ |
| `create_pix_automatic_instruction` real (sai do stub) | ✅ |
| Renovação com auth ACTIVE / jornada sem auth (engine OFF) | ✅ |
| `/saas-pay` — consentimento + status | ✅ |
| Assinaturas SA — badge status | ✅ |
| Runbook BACEN/Asaas | ✅ |
| Lookup conciliation no webhook PAYMENT | ✅ |

## Critérios de aceite

- [x] Flag OFF → fluxo atual (skip / sem auth journey)
- [x] Consentimento via QR composto (opt-in)
- [x] Paid via `PAYMENT_*` (auth events só atualizam status)
- [x] Cancel/expire/refuse → `authorization_lost` + fallback policy
- [ ] Smoke staging: auth journey + ACTIVATED
- [ ] Smoke: instrução na janela 2–10
- [ ] Smoke: auth lost → PIX avulso
- [ ] Elegibilidade Pix Automático na conta Asaas (prod)

## Rollback

1. `billing2.pix_automatic` = OFF  
2. Cancelar auths pendentes no Asaas se necessário (runbook)

## APIs / UI

- `GET …/saas-billing/:token` → `pix_automatic: { available, status, has_active, qr_* }`
- `POST …/saas-billing/:token/start-pix-automatic`
- Detalhe Assinaturas → `pix_automatic_auth_status`

## Arquivos

- `database/init/301_billing2_pix_automatic_authorization.sql`
- `packages/backend/src/services/billing2/billingPixAutomaticStore.ts`
- `packages/backend/src/services/billing2/billingPixAutomaticService.ts`
- `packages/backend/src/modules/gateways/asaas/...`
- `packages/backend/src/services/collectionPolicy/execute.ts`
- `packages/backend/src/services/billingRenewalEngine/executeSaasRenewal.ts`
- `src/pages/PublicSaasBillingPay.tsx`
- [`BILLING2_PIX_AUTOMATIC_OPS.md`](./BILLING2_PIX_AUTOMATIC_OPS.md)

## Próximo

S11 multi-gateway — **não inicia** sem OK explícito.
