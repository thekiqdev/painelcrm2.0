# CRM7 — Closeout (assinaturas existentes)

| Campo | Valor |
|-------|-------|
| **Data** | 2026-07-29 |
| **Sprint** | CRM7 |
| **Paridade** | Meu Plano SaaS enable/disable + D8 (detalhe assinatura) |
| **Fix SSOT** | Default ON cosmético removido — legado permanece OFF |

---

## Entregue

| Item | Status |
|------|--------|
| Enrich GET `/api/crm-subscriptions/:id` → `pix_automatic` | ✅ |
| `POST …/pix-automatic/enable` (fatura aberta) | ✅ `needs_open_invoice` se sem fatura |
| `POST …/pix-automatic/disable` | ✅ opt-out `cleared` |
| Badge no `FinancialHeader` | ✅ |
| Switch em Configurações | ✅ **OFF** no legado; ON só `pending`/`active` |
| Auto-enable ao abrir assinatura | ❌ removido |
| Próxima fatura herda SSOT (`pending` → metadata; `active` → instrução) | ✅ |
| Testes enable / SSOT | ✅ |

---

## Comportamento (SSOT)

Fonte única: `subscriptions.pix_automatic_auth_status` (+ auth id).

1. Assinatura antiga (`status` null) → switch **OFF** (assinatura e fatura alinhados).
2. Operador liga com fatura aberta → auth `pending` na assinatura; fatura recebe metadata.
3. Próxima fatura do worker: se `pending` → propaga QR/metadata; se `active` → instrução CRM4.
4. Sem fatura aberta ao ligar → `needs_open_invoice`.
5. Desligar → `cleared` / cancel auth.

---

## Exit

Operador controla débito automático em assinaturas existentes **sem** distorção vs fatura/`/pay`.
