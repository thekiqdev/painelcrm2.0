# CRM5 — Closeout (webhooks + liquidação 1º pagamento)

| Campo | Valor |
|-------|-------|
| **Data** | 2026-07-29 |
| **Sprint** | CRM5 |
| **Referência** | [`LESSONS_SAAS_FIRST_PAYMENT_ORPHAN.md`](./LESSONS_SAAS_FIRST_PAYMENT_ORPHAN.md) R1–R6 |
| **Flag** | `crm.pix_automatic` — handlers fail-open; path legado intacto se OFF |

---

## Entregue

| Item | Status |
|------|--------|
| Auth events → `updateCrmPixAutomaticAuthStatus` (ACTIVATED→active) | ✅ no handler compartilhado |
| **ACTIVATED liquida `customer_invoice` aberta** (`applyPaymentEvent` paid) | ✅ `settleCustomerInvoiceOnPixAutomaticActivated` |
| PAYMENT lookup: `gateway_reference_id` **ou** conciliation **ou** `pixQrCodeId` → CRM | ✅ `webhookCore` + parser (já existia) |
| G1: `PIX_AUTOMATIC_*` na lista de provisionamento | ✅ (CRM0) |
| G2: recreate webhook tenants piloto | **Ops** — `POST …/asaas/recreate-webhook` |
| Paid: cancela charge avulso do ciclo; **não** cancela auth | ✅ settle + webhookCore extras |
| Cancel assinatura CRM cancela auth | ✅ `cancelPixAutomaticAuthorizationForCrmSubscription` |
| Testes: parser `pixQrCodeId`; ACTIVATED→paid CRM | ✅ |

---

## Dupla via (R1)

| Via | Caminho |
|-----|---------|
| **A** | `PAYMENT_*` → conciliation/`pixQrCodeId` → `findCustomerInvoiceByPixAutomaticConciliation` → paid |
| **B** | `AUTHORIZATION_ACTIVATED` → `settleCustomerInvoiceOnPixAutomaticActivated` → paid |

Smoke **reprovado** se Asaas RECEIVED + auth ACTIVE e fatura CRM ≠ `paid` (R5).

---

## Ops piloto (G2)

1. Flag `crm.pix_automatic` ON.
2. Por tenant piloto: recreate webhook Asaas (events incluem `PIX_AUTOMATIC_*`).
3. Smoke: pagar QR composto → auth ACTIVE **e** `customer_invoices.status = paid`.
4. **Não** usar reenvio do mesmo webhook como recovery (R4) — script órfão fica no **CRM6**.

---

## Exit

**GO CRM6** (runbook, script `settleOrphan*` CRM, copy UX, regressão flag OFF).
