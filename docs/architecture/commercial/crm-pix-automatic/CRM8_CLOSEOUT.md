# CRM8 — Closeout (intenção adiada sem fatura aberta)

| Campo | Valor |
|-------|-------|
| **Data** | 2026-07-29 |
| **Sprint** | CRM8 |
| **Predecessor** | CRM7 |
| **Problema** | Enable na assinatura exigia fatura aberta (`needs_open_invoice`) — ciclo futuro bloqueava o operador |

---

## Entregue

| Item | Status |
|------|--------|
| Status SSOT `requested` (tipo + store `markCrmPixAutomaticRequested`) | ✅ |
| Enable sem fatura → intenção + `deferred: true` | ✅ |
| Enable com fatura → start Asaas (inalterado) | ✅ |
| Preference: `switch_on` com `requested` | ✅ |
| Worker `executeGatewayChargeForInvoice`: branch `requested` → finalize | ✅ |
| UI: badge «Débito PIX pedido», hints, toast deferred | ✅ |
| Testes enable + UX switch | ✅ |
| Migração `305_…_requested_status.sql` (CHECK + `requested`) | ✅ |

---

## Comportamento

| Situação | Resultado |
|----------|-----------|
| Ligar sem fatura aberta | `subscriptions.pix_automatic_auth_status = requested`, sem auth Asaas |
| Ligar com fatura aberta | Start auth → `pending` + QR (CRM7) |
| Renovação / gerar cobrança com `requested` | Finalize: start se cliente+CPF; senão metadata `pix_automatic_requested` (link) |
| Desligar | `cleared` (opt-out) |
| UI | Pedido ≠ Pendente ≠ Ativo |

**Não** gera fatura no enable. **Não** chama Asaas só com intenção.

---

## Exit

Operador pode ligar débito automático em assinatura com ciclo futuro; autorização nasce com a fatura do ciclo.
