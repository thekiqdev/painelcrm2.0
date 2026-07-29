# CRM2 — Closeout (criação no painel)

| Campo | Valor |
|-------|-------|
| **Data** | 2026-07-29 |
| **Sprint** | CRM2 |
| **Flag** | `crm.pix_automatic` default OFF — toggle só aparece com gate |
| **Fase 1.1** | Proposta / loja — **backlog** (não neste sprint) |

---

## Entregue

| Item | Status |
|------|--------|
| Body API `pix_automatic: boolean` (zod) | ✅ |
| `createManualInvoice` / `createRecurringManualInvoice` → finalize start | ✅ degradação se Asaas falhar |
| `GET gateway-status` → `pix_automatic_available` | ✅ |
| Toggle em `CustomerInvoiceNew` (manual + assinatura) | ✅ só se flag+Asaas+PIX permitido |
| Badge Pix Auto no detalhe | ✅ GET `:id` enriquece `pix_automatic` |
| Testes finalize (não pedido / sem PIX / deferred link) | ✅ |

---

## Comportamento

1. Operador vê switch **só** se `crm.pix_automatic` ON + gateway Asaas + PIX nos métodos.
2. Create com `pix_automatic: true` → start auth (CRM1); se falhar → fatura com PIX avulso + `pix_automatic_requested` + warning.
3. Fatura por link sem cliente → `deferred_until_client` (CRM3 no `/pay`).
4. Recorrente: start **depois** do link `subscription_id`.

---

## Exit

**GO CRM3** (`/pay` switch + start/cancel público).

Liquidação webhook 1º pagamento continua **CRM5**.
