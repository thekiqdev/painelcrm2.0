# M5 S5 — Central de Vendedores + comissões

| Campo | Valor |
|-------|-------|
| **Data** | 2026-08-17 |
| **Sprint** | **S5** (feito) |
| **Plano-mãe** | [`PLAN_SPRINTS_M5_PARTNER_WHITELABEL.md`](./PLAN_SPRINTS_M5_PARTNER_WHITELABEL.md) |
| **Próximo** | **S6** feito — ver [`SPRINT_M5_S6_SUSPENSION_MIGRATION.md`](./SPRINT_M5_S6_SUSPENSION_MIGRATION.md) |

---

## Decisão S5.cap

**Truncar** comissão no lucro do ciclo (`commission_capped=true` no ledger). Regra pode ser salva mesmo se teoricamente alta; no accrual nunca passa do lucro.

---

## Entregas

### Schema
- `322_partner_commission_s5.sql` — `partner_commission_rules`, `partner_commission_ledger`, `partner_commission_payouts`

### Backend
| Rota | Função |
|------|--------|
| `GET/POST /api/partner/seller-rules` | Regra equipe (`seller_user_id` null) ou override |
| `DELETE /api/partner/seller-rules/:id` | Arquivar |
| `PATCH /api/partner/sellers/:id` | status active/inactive + nome |
| `GET /api/partner/commissions` | Extrato admin |
| `POST /api/partner/commissions/payouts` | Marcar pago |
| `POST /api/partner/commissions/:id/clawback` | Clawback (available/pending) |
| `POST /api/partner/commissions/accrue` | Accrual manual (teste) |
| `GET /api/partner/seller/me/commissions` | Extrato do vendedor |

- Hook: `activatePlanFromBilling` → `maybeAccruePartnerCommissionForBilling` (idempotente)
- Lucro = `amount_cents − unit_cost_cents × seats`
- Casa (sem seller) → sem accrual

### Frontend (`/partner`)
- Admin: regras, extrato, marcar pago, desativar seller
- Seller: link + ganhos

### Testes
- `partnerCommissionMath` (cap, hybrid, cycles)

---

## DoD S5

- [x] CRUD sellers (patch status) + unicidade global
- [x] Regras equipe + override seller (híbrido, ciclos, 1ª/renovação)
- [x] Cap operacional = lucro (truncate)
- [x] Ledger + clawback + payout marcar pago
- [x] Seller vê só link + ganhos (sem customers/billing)
- [x] Accrual no pagamento confirmado do canal

---

## Como validar

1. Migration `322`
2. Em `/partner`: criar regra equipe 10% do lucro
3. Cliente com seller paga fatura SaaS → ledger `available`
4. Admin marca pago → status `paid` + payout
5. Seller em `/partner` vê extrato
