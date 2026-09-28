# CRM1 — Closeout (persistência + serviço)

| Campo | Valor |
|-------|-------|
| **Data** | 2026-07-29 |
| **Sprint** | CRM1 |
| **Flag** | `crm.pix_automatic` continua default **OFF** |
| **Constraint** | Sem UI `/pay` / criação (CRM2–3); zero impacto com flag OFF |

---

## Entregue

| Item | Status |
|------|--------|
| Índice `subscriptions` type=customer + auth active | ✅ `304_crm_pix_automatic_customer_index.sql` |
| Store get/upsert/opt-out (`cleared`) customer | ✅ `crmPixAutomaticStore.ts` |
| `getCustomerInvoiceById` | ✅ `customerInvoiceService` |
| `getActiveAsaasConfigForCrm(tenantId)` | ✅ `gatewayProvider` |
| Start auth Jornada 3 p/ `customer_invoice` | ✅ `startPixAutomaticAuthorizationForCustomerInvoice` |
| Ensure draft `trialing` se fatura sem `subscription_id` | ✅ `ensureCustomerSubscriptionLinkedToOpenInvoice` |
| Conciliation na sub **e** metadata fatura (G10) | ✅ |
| QR `data:image/png;base64,…` | ✅ |
| Stash `standalone_pix_*` + cancel/restore | ✅ |
| Lookup conciliation → `customer_invoices` (prep CRM5) | ✅ `findCustomerInvoiceByPixAutomaticConciliation` |
| Testes unitários (flag OFF, start, cancel) | ✅ |

---

## Arquivos

- `database/init/304_crm_pix_automatic_customer_index.sql`
- `packages/backend/src/services/crm/crmPixAutomaticStore.ts`
- `packages/backend/src/services/crm/crmPixAutomaticService.ts`
- `packages/backend/src/services/crm/*.test.ts`

---

## Exit

- **GO CRM2 / CRM3** — toggle criação + `/pay` podem chamar o serviço.
- Flag OFF → `flag_crm_pix_automatic_off`; fluxo CRM legado intacto.
- Liquidação webhook 1º pagamento ainda é **CRM5** (G10).
