# Sprint WI2 — Preço por instância WhatsApp no catálogo

| Campo | Valor |
|-------|--------|
| **Sprint** | WI2 |
| **Plano-mãe** | [PLANO_WHATSAPP_INSTANCES_VIA_PLANOS.md](./PLANO_WHATSAPP_INSTANCES_VIA_PLANOS.md) |
| **Status** | `DONE` — ver [SPRINT_WI2_CLOSEOUT.md](./SPRINT_WI2_CLOSEOUT.md) |
| **Depende de** | WI1 DONE |
| **Desbloqueia** | WI3 (instance_addon self-service) |

---

## Objetivo

Permitir no Super Admin definir **valor por conexão WhatsApp extra** por periodicidade (`plan_interval_prices.price_per_instance_cents`). Sem checkout ainda.

---

## Entregas

1. Migration `293_plan_interval_prices_price_per_instance.sql`
2. CRUD planos: lê/grava `price_per_instance_cents`
3. UI `SuperAdminPlans`: campo por intervalo (custom) + valor extra (standard)
4. Coluna preparada `subscriptions.contracted_price_per_instance_cents` (sem wiring de billing)

## Aceite

- [ ] Grava e lê `price_per_instance_cents` por intervalo
- [ ] NULL / vazio = extras não vendáveis
- [ ] Sem regressão em preço por usuário / seat addon
