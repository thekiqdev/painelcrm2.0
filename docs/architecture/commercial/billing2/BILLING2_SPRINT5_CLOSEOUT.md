# Billing 2.0 — Sprint 5 Closeout

| Campo | Valor |
|-------|-------|
| **Sprint** | 5 — Assinaturas SA |
| **Data** | 2026-07-27 |
| **Status** | Implementada — aguardando aprovação |

## Entregáveis

| Item | Status |
|------|--------|
| Lista/filtro `subscriptions` type=saas | ✅ |
| Detalhe: status, next due, método, tenant, valor, faturas, audit | ✅ |
| Labels claros contrato vs tenant vs fatura | ✅ |
| Writer `past_due` (grace + flag OFF default) | ✅ |
| `past_due` → `active` no pagamento | ✅ |
| Sync batch no overdue (flag gated) | ✅ |
| UI `/superadmin/billing/subscriptions` | ✅ |
| Pix Auto / token card UI | ❌ fora (S9/S10) |

## Critérios de aceite

- [x] `past_due` deixa de ser estado morto (writer + clear on paid)
- [x] Labels separam tenant.status / subscription.status / invoice.status
- [x] Com engine OFF, listagem funciona (read-only)
- [x] Writer default OFF (sem mass update no deploy)
- [ ] Smoke staging lista/detalhe
- [ ] Smoke opcional com `past_due_writer_enabled` ON em staging

## Rollback

1. Super Admin → `billing2.past_due_writer_enabled` = OFF  
2. UI permanece read-only  
3. Contratos já em `past_due` podem ser limpos no próximo `paid`  

## APIs

- `GET /api/superadmin/billing/subscriptions?status=&q=&limit=&offset=`
- `GET /api/superadmin/billing/subscriptions/:id`

## Testes

- `subscriptionPastDueWriter.test.ts`
