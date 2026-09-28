# Sprint WI3 — Add-on self-service de conexões WhatsApp (Meu Plano)

| Campo | Valor |
|-------|--------|
| **Sprint** | WI3 |
| **Gate** | Em execução → closeout |
| **OK produto** | 2026-07-20 (OK Sprint 3) |
| **Plano-mãe** | [PLANO_WHATSAPP_INSTANCES_VIA_PLANOS.md](./PLANO_WHATSAPP_INSTANCES_VIA_PLANOS.md) |
| **Próxima** | WI4 — renovação / próximo ciclo |

---

## Objetivo

Tenant compra conexões WhatsApp extras em `/meu-plano`, espelhando `seat_addon`:

preview pró-rata → checkout → pagamento → sobe `max_whatsapp_instances_override`.

---

## Entregas

| Item | Detalhe |
|------|---------|
| Migration | `294_instance_addon_billing.sql` — `instance_addon_pending_billing_id` + CHECK `billing_reason` |
| Serviço | `tenantInstanceCommercialService.ts` (preview + checkout) |
| Billing | `billing_reason = instance_addon`; `calculateInstanceAddonProrata`; activate sobe override |
| Rotas | `POST /api/me/tenant/instance-addon/preview` + `.../checkout` |
| Hub | `GET /api/me/tenant/plan` → `pending_instance_addon_billing` |
| UI | Secção **Conexões WhatsApp** em `MeuPlano.tsx` |
| Checkout | `InternalBillingCheckout` — label + preview `instance_addon` |
| Histórico | Hub lista `instance_addon` em cobranças comerciais |

---

## Modelo

- `current_contracted = override ?? plan.max_whatsapp_instances`
- `NULL` (ilimitado) → extras **não** se aplicam
- Preço: `contracted_price_per_instance_cents` ou catálogo `price_per_instance_cents`
- Standard e custom (não só custom como seats)
- `users_count` na fatura guarda o **novo total de instâncias** (mesmo padrão overloaded do seat)

---

## Aceite

- [x] Preview pró-rata coerente
- [x] Pagamento confirmado aumenta override
- [x] Falha de pagamento não sobe override
- [x] Histórico mostra `instance_addon`
- [ ] Alias `/planos` (opcional — não feito; hub continua `/meu-plano`)
