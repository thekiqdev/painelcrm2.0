# M5 S3 — Programa + planos + gateway Partner

| Campo | Valor |
|-------|-------|
| **Data** | 2026-08-13 |
| **Sprint** | **S3** (feito) |
| **Plano-mãe** | [`PLAN_SPRINTS_M5_PARTNER_WHITELABEL.md`](./PLAN_SPRINTS_M5_PARTNER_WHITELABEL.md) |
| **Próximo** | **S5** — Central de Vendedores + comissões |

---

## Entregas

### Schema
- `320_partner_sell_plans.sql` — planos de venda do Partner

### Backend
| Rota | Função |
|------|--------|
| `GET /api/partner/licenses` | Pool used/purchased/available (COUNT users) |
| `GET/PUT /api/partner/gateway` | Asaas no `payment_gateway_configs` do tenant Partner |
| `POST /api/partner/gateway/test` | Testa conexão → status `active` |
| `CRUD /api/partner/sell-plans` | Preço ≥ piso; publicar exige gateway ok |
| `GET /api/partner/sell-plans/projection` | Receita − custo licenças |

Helpers: `assertPartnerPoolAllowsNewUser`, `canPartnerSellWithGateway` (para S4 cobrança).

### Frontend (`/partner`)
- Card licenças, gateway Asaas, planos (criar draft + publicar) com projeção ao vivo

### Testes
- 20 testes partner — OK

---

## Regras MVP

- Programa **`license_pool`** apenas
- Gateway **Asaas** apenas
- Publicar plano (`status=active`) só com gateway testado (`can_charge`)
- Preço &lt; piso → `PRICE_BELOW_FLOOR`
- 1 licença = 1 usuário nos `customer_tenant`s (enforcement helper pronto para S4)

---

## DoD S3

- [x] Pool + contador used
- [x] Sell plans + piso + projeção
- [x] Gateway Partner Asaas configurável/testável
- [x] UI Partner
- [ ] Cobrança end-customer no gateway Partner — **S4** (checkout/acquisition)
