# M5 S4 — Carteira + acquisition (fecha MVP)

| Campo | Valor |
|-------|-------|
| **Data** | 2026-08-13 |
| **Sprint** | **S4** (feito) |
| **Plano-mãe** | [`PLAN_SPRINTS_M5_PARTNER_WHITELABEL.md`](./PLAN_SPRINTS_M5_PARTNER_WHITELABEL.md) |
| **Próximo** | **S6** — Superadmin + suspensão/migração |

---

## Entregas

### Schema
- `321_partner_acquisition_attribution.sql` — `partner_id` / `seller_user_id` / `seller_referral_code` em leads e sessions

### Backend
| Rota | Função |
|------|--------|
| `GET /api/partner/customers` | Carteira isolada por Partner |
| `PATCH /api/partner/customers/:id` | Reatribuir seller (`null` = casa) |
| `GET/POST /api/partner/sellers` | Lista + create mínimo (membership + referral) |
| `GET /api/partner/sale-link` | Link casa (sem `?ref=`) |
| `GET /api/partner/seller/me/link` | Link do vendedor |

- Attribution: host WL + `?ref=` → lead/session (first-touch)
- Provision: `account_type=customer_tenant` + `partner_id`/`seller_user_id`; pool assert + refresh seats
- Gateway: `customer_tenant` CRM/SaaS resolve para config Asaas do **Partner pai**
- FE signup: persiste `ref` e envia em capture/step

### Frontend (`/partner`)
- Admin: carteira, sellers, link casa
- Seller: só link de venda

### Testes
- Attribution + customers unitários

---

## DoD S4

- [x] Checkout/link com partner + seller opcional
- [x] Sem seller → carteira casa
- [x] UI Partner clientes + reatribuir
- [x] Isolamento entre Partners (query por `partner_id`)
- [x] Seller membership + link (comissões = S5)
- [x] Cobrança canal via gateway do Partner
- [x] Venda direta intacta (`platform_customer` + gateway global)

---

## Como validar

1. Migration `321`
2. Flag `partner.channel_v1` ON
3. Partner com domínio/gateway/planos (S2–S3)
4. Abrir `/cadastro?ref=CODIGO` no domínio WL → lead com seller
5. Provisionar → tenant `customer_tenant` na carteira
6. Seller em `/partner` vê só o link
