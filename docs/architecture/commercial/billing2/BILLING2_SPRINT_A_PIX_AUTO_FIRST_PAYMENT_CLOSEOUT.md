# Billing 2.0 — Sprint A Closeout (Pix Auto no 1º pagamento)

| Campo | Valor |
|-------|-------|
| **Sprint** | A — corrigir `missing_subscription_id` + Pix Auto no 1º pagamento |
| **Data** | 2026-07-27 |
| **Status** | Implementada — aguardando smoke staging |
| **Flag** | `billing2.pix_automatic` permanece default **OFF** (opt-in) |

## Problema

`/checkout` cria fatura `plan_purchase` **sem** `subscription_id`.  
A subscription SaaS só nascia no **paid** (`ensureSaasSubscriptionAfterPaidActivation`).  
`POST …/start-pix-automatic` exigia `subscription_id` → **`missing_subscription_id`**.

## Solução

1. **Draft `trialing`** antes do pagamento (`created_by: checkout_draft`)  
2. **Link** `tenant_billing.subscription_id` via `ensureSaasSubscriptionLinkedToOpenBilling`  
3. No **paid**, **promove** `trialing` → `active` (não cria segunda subscription)  
4. Scheduler de renovação continua só em `active` → draft não gera cobrança prematura  
5. Fallback no start Pix Auto: se fatura ainda sem link, chama o ensure de novo

## Critérios de aceite

- [x] `subscribePlan` (com e sem gateway) tenta linkar draft subscription  
- [x] `startPixAutomaticAuthorizationForBilling` não falha só por fatura de 1ª compra sem sub  
- [x] Paid promove `trialing` → `active`  
- [x] Flag default OFF (Sprint B: obrigatoriedade / default ON)  
- [ ] Smoke staging: checkout → `/saas-pay` → “Autorizar Pix Automático” com flag ON opt-in  
- [ ] Smoke: paid promove trialing; renovação só após active

## Rollback

1. Flag OFF (comportamento Pix Auto desligado)  
2. Drafts `trialing` sem paid permanecem inertes para o scheduler  
3. Código de promote/link é idempotente e seguro com flag OFF

## Arquivos

- `packages/backend/src/services/billingSubscriptionService.ts` — status opcional, `getOpenSaasSubscriptionByTenant`, `promoteSaasTrialingSubscriptionToActive`
- `packages/backend/src/services/subscriptionService.ts` — `ensureSaasSubscriptionLinkedToOpenBilling` + chamada em `subscribePlan` / promote no paid
- `packages/backend/src/services/billing2/billingPixAutomaticService.ts` — ensure fallback
- Testes `*.sprintA.test.ts`
- Ops: [`BILLING2_PIX_AUTOMATIC_OPS.md`](./BILLING2_PIX_AUTOMATIC_OPS.md)

## Próximo

**Sprint B** — obrigatoriedade do Pix Automático + default ON (piloto controlado).
