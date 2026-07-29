# CRM0 — Closeout (spike + gating)

| Campo | Valor |
|-------|-------|
| **Data** | 2026-07-29 |
| **Sprint** | CRM0 |
| **Flag** | `crm.pix_automatic` default **OFF** |
| **Docs** | [`CRM0_SPIKE.md`](./CRM0_SPIKE.md) · [`LESSONS_SAAS_FIRST_PAYMENT_ORPHAN.md`](./LESSONS_SAAS_FIRST_PAYMENT_ORPHAN.md) |

---

## Entregue

| Item | Status |
|------|--------|
| Spike código + Asaas (webhooks, avulsa, janela, valor, boleto) | ✅ `CRM0_SPIKE.md` |
| Lição 1º pagamento órfão SaaS no plano CRM | ✅ `LESSONS_…` + D7/CRM5 |
| Seed `platform_feature_flags` `crm.pix_automatic` OFF | ✅ migração `303_crm_pix_automatic_platform_flag.sql` |
| Keys registry (`featureFlagKeys` + namespace `crm`) | ✅ |
| Helper `isCrmPixAutomaticEnabled` / `canOfferCrmPixAutomatic` | ✅ `crmPixAutomaticFlags.ts` + testes |
| Provisionamento webhook tenant: eventos `PIX_AUTOMATIC_*` (+ eligibility) | ✅ `ASAAS_WEBHOOK_EVENTS` em `asaasIntegrationService` |
| UI toggle / API create | ⏳ CRM2 (gate usa `canOfferCrmPixAutomatic`) |

---

## Ops pós-deploy (G2)

Tenants Asaas **já conectados** reutilizam webhook sem atualizar eventos na Asaas. Após deploy:

1. Super Admin / tenant: **Recriar webhook** Asaas (`POST …/asaas/recreate-webhook`), **ou**
2. Painel Asaas: incluir eventos `PIX_AUTOMATIC_RECURRING_*` no webhook apontando para `{API}/api/webhooks/asaas`.

Novos connects após deploy: `createWebhook` já envia a lista completa (se não houver reuse por URL).

---

## Como ligar (piloto)

1. Super Admin → Avançado → Feature Flags → namespace `crm` → `crm.pix_automatic` = ON  
   (ou env contingência `CRM_FLAG_PIX_AUTOMATIC=true` se a linha ainda não existir no DB)
2. Conta Asaas do tenant elegível (PJ, CNPJ ≥ 6 meses) + webhook com eventos Pix Auto
3. Só então CRM2+ expõem toggle (quando implementado)

---

## Exit CRM0

- **GO CRM1** — flag OFF inerte; store/serviço customer.
- **NO-GO piloto pagamento real** até CRM5 (liquidação G10) + recreate webhook G2.

---

## Arquivos

- `database/init/303_crm_pix_automatic_platform_flag.sql`
- `packages/backend/src/services/crm/crmPixAutomaticFlags.ts`
- `packages/backend/src/services/asaasIntegrationService.ts` (events)
- `packages/backend/src/modules/gateways/asaas/asaasEvents.ts` (`ELIGIBILITY_UPDATED`)
- `packages/backend/src/platform/featureFlagKeys.ts`
