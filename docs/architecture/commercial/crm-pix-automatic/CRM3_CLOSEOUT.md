# CRM3 — Closeout (página pública `/pay`)

| Campo | Valor |
|-------|-------|
| **Data** | 2026-07-29 |
| **Sprint** | CRM3 |
| **Flag** | `crm.pix_automatic` — start/cancel públicos respeitam gate |
| **Paridade** | Espelho SaaS `/saas-billing/:token/*-pix-automatic` |

---

## Entregue

| Item | Status |
|------|--------|
| GET `/customer-invoices/pay/:token` → `pix_automatic` | ✅ |
| Preferência QR composto em `payment_urls` se journey/pending | ✅ |
| `POST …/start-pix-automatic` | ✅ token-bound |
| `POST …/cancel-pix-automatic` (+ restore PIX avulso) | ✅ |
| `getByPaymentToken` expõe `subscription_id` + `gateway` | ✅ |
| Auto-enable 1× se `requested` + status null + CPF | ✅ |
| `CustomerInvoicePay`: `PixAutomaticConsentSwitch` + helpers UX | ✅ |
| Complete pay tenta finalize se `pix_automatic_requested` | ✅ |
| Testes contrato enrich | ✅ |

---

## Comportamento

1. Cliente abre link → se fatura pediu Pix Auto e há CPF, switch default ON; auto-start uma vez.
2. ON → QR composto na área PIX; OFF → cancela auth, restaura avulso, opt-out persiste.
3. Sem CPF / needs_customer → switch desabilitado até completar dados (complete → finalize).

---

## Exit

**GO CRM4** (worker / instrução na janela 2–10).

Liquidação 1º pagamento (ACTIVATED + PAYMENT) permanece **CRM5**.
